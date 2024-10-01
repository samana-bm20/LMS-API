const express = require('express');
const { client } = require('../config/database');
const CryptoJS = require('crypto-js');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

//import pipelines
const leadPIDPipeline = require('../pipelines/leadPIDPipeline');
const leadCountPipline = require('../pipelines/leadCountPipeline');
const productLeadCountPipeline = require('../pipelines/productCountPipeline');
const fetchTasksPipeline = require('../pipelines/fetchTasksPipeline');
const { upload, importLead } = require('../pipelines/insertImportLead');
const { scheduleTaskReminders } = require('../pipelines/triggeredEmailFunction');

const multer = require("multer");
const mongoose = require('mongoose');
const Grid = require('gridfs-stream');
const { GridFsStorage } = require("multer-gridfs-storage");
const mongoURI = process.env.DATABASE_URL;
// Initialize gfs
const conn = mongoose.createConnection(mongoURI);
let gfs;
conn.once('open', () => {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
});
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    const sno = req.body;
    return {
      filename: file.originalname,
      bucketName: "uploads",
      metadata: {
        F_ID: sno,
        uploadedBy: req.body.uploadedBy || 'Unknown',
      },
      contentType: file.mimetype,
    };
  },
});
const uploadMulter = multer({ storage });

//LeadsMaster apis
const collection = client.db().collection('Leads');
const sCollection = client.db().collection('Status');
const pCollection = client.db().collection('Products');
const uCollection = client.db().collection('Users');
const lpCollection = client.db().collection('LeadProducts');
const fCollection = client.db().collection('FollowUp');
const tCollection = client.db().collection('Tasks');
const ESRIProductCollection = client.db().collection("VendorESRIClientProduct");

const getNextSequence = async (name) => {
  const next = await client.db().collection('Counter').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return next.seq;
}

const areObjectsEqual = (obj1, obj2) => {
  return obj1.notificationType === obj2.notificationType &&
    obj1.frequencyValue === obj2.frequencyValue &&
    obj1.frequencyUnit === obj2.frequencyUnit;  // Add more fields as necessary
}

const areRemindersEqual = (arr1, arr2) => {
  if (arr1.length !== arr2.length) return false;

  for (let i = 0; i < arr1.length; i++) {
    if (!areObjectsEqual(arr1[i], arr2[i])) {
      return false;
    }
  }

  return true;
}

const encryptData = (data) => {
  return CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
}

const decryptData = (data) => {
  const bytes = CryptoJS.AES.decrypt(data, ENCRYPTION_KEY);
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

// module.exports = (io) => {
module.exports = () => {
  const router = express.Router();
  router.get("/", async (req, res) => {
    return res.status(200).json({ msg: `API starts running` });
  });

  router.get('/leads-count', async (req, res) => res.sendStatus(405));
  router.post('/leads-count', async (req, res) => {
    try {
      const uid = req.body.uid;

      const user = await uCollection.findOne({ UID: uid });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userType = user.userType;
      const pipeline = leadCountPipline(userType, uid);

      const data = await lpCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));
    } catch (err) {
      console.error('Error fetching lead counts', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/productlead-count', async (req, res) => res.sendStatus(405));
  router.post('/productlead-count', async (req, res) => {
    try {
      const uid = req.body.uid;

      const user = await uCollection.findOne({ UID: uid });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userType = user.userType;
      const pipeline = productLeadCountPipeline(userType, uid);

      const data = await lpCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));
    } catch (err) {
      console.error('Error fetching leads status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/leadData', async (req, res) => res.sendStatus(405));
  router.post('/leadData', async (req, res) => {
    try {
      const { uid, pid } = req.body;

      const user = await uCollection.findOne({ UID: uid });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userType = user.userType;
      const pipeline = leadPIDPipeline(userType, uid, pid);

      const data = await lpCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));

    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.get('/status', async (req, res) => res.sendStatus(405));
  router.post('/status', async (req, res) => {
    try {
      const data = await sCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/products', async (req, res) => res.sendStatus(405));
  router.post('/products', async (req, res) => {
    try {
      const data = await pCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/users', async (req, res) => res.sendStatus(405));
  router.post('/users', async (req, res) => {
    try {
      const data = await uCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.post('/addUser', async (req, res) => {
    try {
      const data = req.body;

      const existingUser = await uCollection.findOne({
        $or: [
          { uName: data.uName },
          { username: data.username },
          { password: data.password },
          { email: data.email },
          { mobile: data.mobile }
        ]
      });

      if (existingUser) {
        return res.status(400).send('Some or all of user details already exist');
      }

      const nextUID = await getNextSequence("UID");

      const userDetails = {
        UID: "U" + nextUID,
        uName: data.uName,
        username: data.username,
        password: data.password,
        email: data.email,
        mobile: data.mobile,
        userType: Number(data.userType),
        uStatus: data.uStatus
      };

      await uCollection.insertOne(userDetails);

      res.status(200).send('User added successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editUser/:UID', async (req, res) => {
    try {
      const UID = req.params.UID;
      const data = req.body;
      const user = await uCollection.findOne({ UID });

      if (!user) {
        return res.status(404).send('User not found.');
      }

      const updatedFields = {};

      if (data.uName !== user.uName) {
        updatedFields.uName = data.uName;
      }

      if (data.username !== user.username) {
        updatedFields.username = data.username;
      }

      if (data.password !== user.password) {
        updatedFields.password = data.password;
      }

      if (data.email !== user.email) {
        updatedFields.email = data.email;
      }

      if (data.mobile !== user.mobile) {
        updatedFields.mobile = data.mobile;
      }

      if (Number(data.userType) !== user.userType) {
        updatedFields.userType = Number(data.userType);
      }

      if (data.uStatus !== user.uStatus) {
        updatedFields.uStatus = data.uStatus;
      }

      if (Object.keys(updatedFields).length === 0) {
        return res.status(400).send('No changes detected.');
      }

      const existingUser = await uCollection.findOne({
        $and: [
          { UID: { $ne: UID } },
          {
            $or: [
              { uName: data.uName },
              { username: data.username },
              { password: data.password },
              { email: data.email },
              { mobile: data.mobile }
            ]
          }
        ]
      });

      if (existingUser) {
        return res.status(400).send('Duplicate details cannot be inserted');
      }

      await uCollection.updateOne(
        { UID },
        {
          $set: updatedFields
        }
      );

      res.status(200).send('User updated successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.get('/leadDetails', async (req, res) => res.sendStatus(405));
  router.post('/leadDetails', async (req, res) => {
    try {
      const data = await collection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/productDetails', async (req, res) => res.sendStatus(405));
  router.post('/productDetails', async (req, res) => {
    try {
      const data = await lpCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/followUpDetails', async (req, res) => res.sendStatus(405));
  router.post('/followUpDetails', async (req, res) => {
    try {
      const data = await fCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.post('/addLead', async (req, res) => {
    try {
      const data = req.body;

      const existingLead = await collection.findOne({ LID: data.LID });
      if (existingLead) {
        return res.status(400).send('This LID already exists.');
      }

      const query = {
        name: data.name,
        organizationName: data.organizationName,
        $or: []
      };

      if (data.contact?.mobileNo) {
        query.$or.push({ 'contact.mobileNo': data.contact.mobileNo });
      }

      if (data.contact?.emailID) {
        query.$or.push({ 'contact.emailID': data.contact.emailID });
      }

      if (query.$or.length === 0) {
        delete query.$or;
      }

      const existingLeadByName = await collection.findOne(query);

      if (existingLeadByName) {
        return res.status(400).send('This lead already exists.');
      }

      const nextLID = await getNextSequence("LID");

      const lead = {
        LID: parseInt(nextLID),
        name: data.name,
        designationDept: data.designationDept,
        organizationName: data.organizationName,
        contact: data.contact,
        address: data.address
      };

      const istDate = new Date();
      const utcDate = new Date(istDate.getTime() - (istDate.getTimezoneOffset() * 60000));


      const productDetails = {
        LID: parseInt(nextLID),
        PID: data.PID,
        SID: data.SID,
        UID: data.UID,
        source: data.source,
        createdOn: utcDate
      };

      await collection.insertOne(lead);
      await lpCollection.insertOne(productDetails);

      res.status(200).send('Lead inserted successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editLead/:LID', async (req, res) => {
    try {
      const LID = Number(req.params.LID);
      const data = req.body;
      const lead = await collection.findOne({ LID });

      if (!lead) {
        return res.status(404).send('Lead not found.');
      }

      const conditions = [
        ...(data.contact?.mobileNo ? [{ "contact.mobileNo": data.contact.mobileNo }] : []),
        ...(data.contact?.emailID ? [{ "contact.emailID": data.contact.emailID }] : []),
        ...(data.name ? [{ name: data.name }] : []),
        ...(data.organizationName ? [{ organizationName: data.organizationName }] : [])
      ];

      if (conditions.length > 0) {
        const duplicateLead = await collection.findOne({
          LID: { $ne: LID }, // Exclude the current lead
          $or: conditions
        });

        if (duplicateLead) {
          return res.status(400).send('Duplicate details found.');
        }
      }

      const updatedFields = {};

      if (data.name && data.name !== lead.name) {
        updatedFields.name = data.name;
      }

      if (data.organizationName && data.organizationName !== lead.organizationName) {
        updatedFields.organizationName = data.organizationName;
      }

      if (data.contact) {
        const contactUpdate = {};
        if (data.contact.mobileNo !== lead.contact?.mobileNo) {
          contactUpdate.mobileNo = data.contact.mobileNo;
        }
        if (data.contact.emailID !== lead.contact?.emailID) {
          contactUpdate.emailID = data.contact.emailID;
        }
        if (Object.keys(contactUpdate).length > 0) {
          updatedFields.contact = contactUpdate;
        }
      }

      if (data.designationDept !== lead.designationDept) {
        updatedFields.designationDept = data.designationDept;
      }

      if (data.address !== lead.address) {
        updatedFields.address = data.address;
      }

      if (Object.keys(updatedFields).length === 0) {
        return res.status(400).send('No changes detected.');
      }

      await collection.updateOne(
        { LID },
        {
          $set: updatedFields
        }
      );

      res.status(200).send('Lead updated successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.post('/addProduct', async (req, res) => {
    try {
      const data = req.body;

      const existingLeadProduct = await lpCollection.findOne({
        LID: data.LID,
        PID: data.PID
      });
      if (existingLeadProduct) {
        return res.status(400).send('This product already exists for the lead.');
      }

      const istDate = new Date();
      const utcDate = new Date(istDate.getTime() - (istDate.getTimezoneOffset() * 60000));

      const productDetails = {
        LID: data.LID,
        PID: data.PID,
        SID: data.SID,
        UID: data.UID,
        source: data.source,
        createdOn: utcDate
      };

      await lpCollection.insertOne(productDetails);

      res.status(200).send('Product added successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.post('/addNewProduct', async (req, res) => {
    try {
      const data = req.body;

      const existingProduct = await pCollection.findOne({ pName: data.pName });
      if (existingProduct) {
        return res.status(400).send('This product already exists.');
      }

      const nextPID = await getNextSequence("PID");

      const productDetails = {
        PID: "P" + nextPID,
        pName: data.pName,
        tagline: data.tagline,
        owner: data.owner,
        pDescription: data.pDescription
      };

      await pCollection.insertOne(productDetails);

      res.status(200).send('Product added successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editProduct/:PID', async (req, res) => {
    try {
      const PID = req.params.PID;
      const data = req.body;
      const product = await pCollection.findOne({ PID });

      if (!product) {
        return res.status(404).send('Product not found.');
      }

      const updatedFields = {};

      if (data.pName !== product.pName) {
        updatedFields.pName = data.pName;
      }

      if (data.tagline !== product.tagline) {
        updatedFields.tagline = data.tagline;
      }

      if (data.owner !== product.owner) {
        updatedFields.owner = data.owner;
      }

      if (data.pDescription !== product.pDescription) {
        updatedFields.pDescription = data.pDescription;
      }

      if (Object.keys(updatedFields).length === 0) {
        return res.status(400).send('No changes detected.');
      }

      await pCollection.updateOne(
        { PID },
        {
          $set: updatedFields
        }
      );

      res.status(200).send('Product updated successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.post('/addFollowUp', async (req, res) => {
    try {
      const data = req.body;

      const istCurrentDate = new Date(data.date);
      const currentDate = new Date(istCurrentDate.getTime() - (istCurrentDate.getTimezoneOffset() * 60000));

      const existingFollowUp = await fCollection.findOne({
        LID: data.LID,
        PID: data.PID,
        date: currentDate
      });
      if (existingFollowUp) {
        return res.status(400).send('You have already added this follow-up.');
      }

      const nextFID = await getNextSequence("FID");

      const followUpDetails = {
        FID: "F" + nextFID,
        LID: data.LID,
        PID: data.PID,
        SID: data.SID,
        UID: data.UID,
        type: data.type,
        remarks: data.remarks,
        date: currentDate,
      };

      if (data.nextDate) {
        const istNextDate = new Date(data.nextDate);
        const nextDate = new Date(istNextDate.getTime() - (istNextDate.getTimezoneOffset() * 60000));
        followUpDetails.nextDate = nextDate;
      }

      if (data.nextType) {
        followUpDetails.nextType = data.nextType;
      }

      await fCollection.insertOne(followUpDetails);

      const latestFollowUp = await fCollection.findOne({
        LID: data.LID,
        PID: data.PID
      }, {
        sort: { date: -1 }
      });

      if (latestFollowUp && latestFollowUp.date.getTime() <= currentDate.getTime()) {
        // If the inserting date is the latest date, update the status in LeadProduct
        await lpCollection.updateOne(
          { LID: data.LID, PID: data.PID },
          { $set: { SID: data.SID } }
        );
      }

      res.status(200).send('Follow-up added successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.get('/tasks', async (req, res) => res.sendStatus(405));
  router.post('/tasks', async (req, res) => {
    try {
      const pipeline = fetchTasksPipeline;
      const data = await tCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.post('/addTask', async (req, res) => {
    try {
      const data = req.body;

      const istCurrentDate = new Date(data.taskDate);
      const currentTaskDate = new Date(istCurrentDate.getTime() - (istCurrentDate.getTimezoneOffset() * 60000));

      const existingTask = await tCollection.findOne({
        taskDate: currentTaskDate
      });
      if (existingTask) {
        return res.status(400).send('You already have a task scheduled at this time.');
      }

      const nextTID = await getNextSequence("TID");

      const taskDetails = {
        TID: "T" + nextTID,
        taskDate: currentTaskDate,
        title: data.title,
        description: data.description,
        createdBy: data.createdBy,
        UID: data.UID,
        taskStatus: data.taskStatus,
      };

      if (data.LID && data.PID) {
        taskDetails.LID = data.LID;
        taskDetails.PID = data.PID;
      }

      if (data.reminder.length > 0) {
        taskDetails.reminder = data.reminder
      }

      const result = await tCollection.insertOne(taskDetails);
      // const newTask = await tCollection.findOne({ _id: result.insertedId });
      // io.to(taskDetails.UID).emit('taskNotification', newTask);

      // If there are reminders, schedule them
      if (data.reminder && data.reminder.length > 0) {
        scheduleTaskReminders(taskDetails, istCurrentDate);

      }
      res.status(200).send('Task added successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editTask/:TID', async (req, res) => {
    try {
      const TID = req.params.TID;
      const data = req.body;
      const task = await tCollection.findOne({ TID });

      if (!task) {
        return res.status(404).send('Task not found.');
      }

      const date = new Date();
      const todayDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));

      const editHistory = {
        editedBy: data.editedBy,
        editedOn: todayDate,
      };

      const istDate = new Date(data.taskDate);
      let currentTaskDate;

      if (data.taskDate) {
        const istDate = new Date(data.taskDate);
        currentTaskDate = new Date(istDate.getTime() - (istDate.getTimezoneOffset() * 60000));

        if (currentTaskDate.toString() !== task.taskDate.toString()) {
          editHistory.previousDate = task.taskDate;
        }
      }

      if (data.taskStatus && data.taskStatus !== task.taskStatus) {
        editHistory.previousStatus = task.taskStatus;
      }

      if (data.UID && data.UID !== task.UID) {
        editHistory.previousUID = task.UID;
      }

      if (Object.keys(editHistory).length === 2 && (data.reminders.length == 0 || areRemindersEqual(data.reminders, task.reminder))) {
        return res.status(400).send('No changes detected.');
      }

      await tCollection.updateOne(
        { TID },
        {
          $set: {
            ...(data.taskDate && { taskDate: currentTaskDate }),
            ...(data.UID && { UID: data.UID }),
            ...(data.taskStatus && { taskStatus: data.taskStatus }),
            ...(Array.isArray(data.reminders) && { reminder: data.reminders })
          },
          $push: {
            edits: editHistory
          }
        }
      );

      const taskDetails = {
        TID,
        title: task.title,
        description: task.description,
        UID: data.UID,
        taskStatus: data.taskStatus,
        reminder: data.reminders,
      };

      if (task.LID && task.PID) {
        taskDetails.LID = task.LID;
        taskDetails.PID = task.PID;
      }

      if (data.reminders && data.reminders.length > 0) {
        scheduleTaskReminders(taskDetails, istDate);
      }

      res.status(200).send('Task updated successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editFollowUp/:FID', async (req, res) => {
    try {
      const FID = req.params.FID;
      const data = req.body;

      const followUp = await fCollection.findOne({ FID });

      if (!followUp) {
        return res.status(404).send('Follow-up not found.');
      }

      const date = new Date();
      const todayDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));

      const editHistory = {
        editedBy: data.editedBy,
        editedOn: todayDate,
      };

      let currentNextDate;
      if (data.nextDate) {
        const istDate = new Date(data.nextDate);
        currentNextDate = new Date(istDate.getTime() - (istDate.getTimezoneOffset() * 60000));

        if (currentNextDate.toString() !== followUp.nextDate.toString()) {
          editHistory.previousNextDate = followUp.nextDate;
        }
      }

      if (data.nextType && data.nextType !== followUp.nextType) {
        editHistory.previousNextType = followUp.nextType;
      }

      if (data.UID && data.UID !== followUp.UID) {
        editHistory.previousUID = followUp.UID;
      }

      // If no fields have changed, don't update
      if (Object.keys(editHistory).length === 2) {
        return res.status(400).send('No changes detected.');
      }

      await fCollection.updateOne(
        { FID },
        {
          $set: {
            ...(data.nextDate && { nextDate: currentNextDate }),
            ...(data.nextType && { nextType: data.nextType }),
            ...(data.UID && { UID: data.UID }),
          },
          $push: {
            edits: editHistory
          }
        }
      );

      res.status(200).send('Follow-up updated successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.post('/importLead', upload.single('file'), importLead);

  router.get('/getESRIProduct', async (req, res) => res.sendStatus(405));
  router.post("/getESRIProduct", async (req, res) => {
    try {
      const data = await ESRIProductCollection.find({
        SNO: { $ne: 0 },
      }).toArray();
      res.status(200).json(encryptData(data));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.get('/getLastIndexESRIProduct', async (req, res) => res.sendStatus(405));
  router.post("/getLastIndexESRIProduct", async (req, res) => {
    try {
      const data = await ESRIProductCollection.find()
        .sort({ SNO: -1 })
        .limit(1)
        .toArray();
      res.status(200).json(encryptData(data[0].SNO));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.post("/insertESRIProduct", async (req, res) => {
    const data = req.body;
    try {
      await ESRIProductCollection.insertOne(data);
      res.status(200).json({ msg: "Record insert successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.post("/updateESRIProduct", async (req, res) => {

    const data = decryptData(req.body.data);
    const sno = req.body.SNO;
    const filter = { SNO: sno }

    const update = {
      $set: {
        ClientName: data.ClientName,
        ClientAddress: data.ClientAddress,
        City: data.City,
        State: data.State,
        Pincode: parseInt(data.Pincode),
        Contact: data.Contact,
        Phone: data.Phone,
        Email: data.Email,
        PONumber: data.PONumber,
        PODate: data.PODate,
        POValue: data.POValue,
        Product: data.Product,
        ProductVersion: parseFloat(data.ProductVersion),
        Description: data.Description,
        NumberOfLicenses: parseInt(data.NumberOfLicenses),
        LicenseDate: data.LicenseDate,
        Tenure: data.Tenure,
        RenewalDueDate: data.RenewalDueDate
      },
    };
    try {
      const result = await ESRIProductCollection.updateOne(filter, update);
      res.status(200).json({ count: result.modifiedCount, msg: "Record insert successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.post("/uploadDoc", uploadMulter.single("file"), (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).send("No file uploaded");
    }
    if (!file.id) {
      return res.status(500).send("Failed to get file ID from GridFS");
    }
    res.status(200).json({
      message: "File uploaded to GridFS successfully",
      fileId: file.id,
    });
  });

  router.get('/download', async (req, res) => res.sendStatus(405));
  router.post('/download', (req, res) => {
    const fid = req.query.fid;
    console.log(gfs.files)
    gfs.files.findOne({ 'metadata.F_ID.SNO': "67" }, (err, file) => {
      if (err || !file) {
        return res.status(404).send('File not found');
      }

      const readStream = gfs.createReadStream(file._id);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Disposition', `attachment; filename=${file.filename}`);

      readStream.pipe(res).on('error', (error) => {
        console.error('Error reading file:', error);
        res.status(500).send('Error reading file');
      });
    });
  });


  return router;

};