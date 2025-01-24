const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { client } = require('../config/database');

const collection = client.db().collection('Leads');
const sCollection = client.db().collection('Status');
const pCollection = client.db().collection('Products');
const uCollection = client.db().collection('Users');
const lpCollection = client.db().collection('LeadProducts');

const getNextSequence = async (name) => {
    const next = await client.db().collection('Counter').findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return next.seq;
}

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function capitalizeWords(str) {
    return str.replace(/\b\w/g, char => char.toUpperCase());
}

function sanitizeFieldNames(obj) {
    const newObj = {};
    for (const key in obj) {
        const newKey = String(key).trim().replace(/\s+/g, '_');
        let value = obj[key];
        if (typeof value === 'string') {
            if (newKey !== 'Email_ID' && newKey !== 'Status*') {
                value = capitalizeWords(value);
            }
            value = value.trim();
        }
        newObj[newKey] = value;
    }
    return newObj;
}

//#region Get IDs
async function getIDs(leadData) {
    const productName = (leadData['Product_Name*'] || '').trim();
    const product = await pCollection.findOne({ pName: productName });

    const statusName = (leadData['Status*'] || '').trim();
    const status = await sCollection.findOne({ sName: statusName });

    const userName = (leadData['Assigned_To*'] || '').trim();
    const user = await uCollection.findOne({ uName: userName });

    return {
        PID: product ? product.PID : null,
        SID: status ? status.SID : null,
        UID: user ? user.UID : null
    };
}

//#region Insert Lead
async function createNewLead(leadData) {
    const nextLID = await getNextSequence('LID');

    const leadToInsert = {
        LID: parseInt(nextLID),
        name: leadData['Lead_Name*'],
        designationDept: {},
        organizationName: leadData['Organization_Name*'],
        contact: {},
        address: {},
    };

    if (('Mobile_No' in leadData)) {
        leadToInsert.contact.mobileNo = leadData['Mobile_No'];
    }

    if (('Email_ID' in leadData)) {
        leadToInsert.contact.emailID = leadData['Email_ID'];
    }

    if (!('Mobile_No' in leadData) && !('Email_ID' in leadData)) {
        delete leadToInsert.contact;
    }

    if (('DesignationDept' in leadData)) {
        leadToInsert.designationDept = leadData['DesignationDept'];
    }
    
    if (!('DesignationDept' in leadData)) {
        delete leadToInsert.designationDept;
    }

    if (('Address' in leadData)) {
        leadToInsert.address = leadData['Address'];
    }
    
    if (!('Address' in leadData)) {
        delete leadToInsert.address;
    }

    await collection.insertOne(leadToInsert);
    return leadToInsert.LID;
}

//#region Insert Product
async function insertProductDetails(LID, PID, SID, UID, leadData) {
    const existingProduct = await lpCollection.findOne({
        LID: LID,
        PID: PID
    });

    const istDate = new Date();
    const utcDate = new Date(istDate.getTime() - (istDate.getTimezoneOffset() * 60000));

    if (!existingProduct) {
        const productDetails = {
            LID: LID,
            PID: PID || 'defaultPID',
            SID: SID || 'defaultSID',
            UID: UID || 'defaultUID',
            source: leadData['Source'],
            createdOn: utcDate,
        };
        await lpCollection.insertOne(productDetails);
    }
}

//#region Duplicates
async function handleDuplicates(duplicateEntries) {
    if (duplicateEntries.length === 0) return null;
    const reportsDir = path.join(__dirname, '../public');

    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    } else {
        const files = fs.readdirSync(reportsDir);
        files.forEach(file => {
            if (file.endsWith('.xlsx')) {
                fs.unlinkSync(path.join(reportsDir, file));
            }
        });
    }

    const reportFilePath = path.join(reportsDir, `duplicates.xlsx`);
    const duplicateReport = XLSX.utils.json_to_sheet(duplicateEntries);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, duplicateReport, 'Duplicates');
    XLSX.writeFile(workbook, reportFilePath);

    return `/public/${path.basename(reportFilePath)}`;
}

//#region Import API
async function importLead(req, res) {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        const duplicateEntries = [];
        let successfulInserts = 0;

        for (let leadData of data) {
            leadData = sanitizeFieldNames(leadData);

            if (!('Product_Name*' in leadData) || !leadData['Product_Name*'].trim() ||
                !('Status*' in leadData) || !leadData['Status*'].trim() ||
                !('Assigned_To*' in leadData) || !leadData['Assigned_To*'].trim()) {
                return res.status(400).json({ message: 'Product details cannot be empty.' });
            }

            const { PID, SID, UID } = await getIDs(leadData);

            const query = {
                $or: [
                    { 'contact.mobileNo': leadData['Mobile_No'] },
                    { 'contact.emailID': leadData['Email_ID'] }
                ]
            };

            const existingLead = await collection.findOne(query);

            if (existingLead) {
                if (existingLead.name !== leadData['Lead_Name*']) {
                    let matchedContacts = [];

                    if (existingLead.contact.mobileNo && existingLead.contact.mobileNo === leadData['Mobile_No']) {
                        matchedContacts.push(`Mobile No: ${existingLead.contact.mobileNo}`);
                    }
                    
                    if (existingLead.contact.emailID && existingLead.contact.emailID === leadData['Email_ID']) {
                        matchedContacts.push(`Email ID: ${existingLead.contact.emailID}`);
                    }

                    if (matchedContacts.length > 0) {
                        const matchedContactsStr = matchedContacts.join(', ');
                        return res.status(400).json({ message: `A lead with ${matchedContactsStr} already exists.` });
                    }
                }
                const productExists = await lpCollection.findOne({
                    LID: existingLead.LID,
                    PID: PID
                });

                if (productExists) {
                    duplicateEntries.push(leadData);
                } else {
                    try {
                        await insertProductDetails(existingLead.LID, PID, SID, UID, leadData);
                        successfulInserts++;
                    } catch (error) {
                        console.error("Error inserting product details for LID:", existingLead.LID, "Error:", error);
                    }
                }
            } else {
                try {
                    if (!('Lead_Name*' in leadData) || !leadData['Lead_Name*'].trim() ||
                        !('Organization_Name*' in leadData) || !leadData['Organization_Name*'].trim()) {
                        return res.status(400).json({ message: 'Lead name or organization name cannot be empty.' });
                    }
                    const newLID = await createNewLead(leadData);
                    await insertProductDetails(newLID, PID, SID, UID, leadData);
                    successfulInserts++;
                } catch (error) {
                    if (error.message === 'Lead name or organization name cannot be empty.') {
                        return res.status(400).json({ message: error.message });
                    }
                    console.error("Error creating new lead or inserting product details.", error);
                }
            }
        }

        const reportFilePath = await handleDuplicates(duplicateEntries);

        if (successfulInserts === 0 && duplicateEntries.length > 0) {
            return res.status(208).json({
                message: 'All leads are found to be duplicate.',
                successfulInserts,
                duplicateCount: duplicateEntries.length,
                reportFilePath
            });
        } else if (successfulInserts > 0 && duplicateEntries.length > 0) {
            return res.status(207).json({
                message: 'Few leads are successfully imported, while others are identified as duplicate.',
                successfulInserts,
                duplicateCount: duplicateEntries.length,
                reportFilePath
            });
        } else if (successfulInserts > 0 && duplicateEntries.length === 0) {
            return res.status(201).json({
                message: 'All leads are imported successfully.',
                successfulInserts,
                duplicateCount: duplicateEntries.length,
                reportFilePath
            });
        } else {
            return res.status(400).json({
                message: 'No leads to import. The uploaded file may be empty or invalid.',
                successfulInserts,
                duplicateCount: duplicateEntries.length,
                reportFilePath: null
            });
        }
    } catch (error) {
        console.error('Error occurred while import file:', error);
        res.status(500).json({ message: 'An error occurred while importing the file.' });
    }
}


module.exports = {
    upload,
    importLead
};

