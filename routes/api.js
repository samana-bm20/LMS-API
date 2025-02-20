const express = require('express');
const jwt = require('jsonwebtoken');
const verifyToken = require('./verifyToken')
const { client } = require('../config/database');
const CryptoJS = require('crypto-js');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const { ObjectId } = require('mongodb');

//import pipelines
const leadPIDPipeline = require('../pipelines/leadPIDPipeline');
const leadCountPipeline = require('../pipelines/leadCountPipeline');
const productLeadCountPipeline = require('../pipelines/productCountPipeline');
const fetchTasksPipeline = require('../pipelines/fetchTasksPipeline');
const { upload, importLead } = require('../pipelines/insertImportLead');
const { scheduleTaskReminders } = require('../pipelines/triggeredEmailFunction');

const mongodb = require("mongodb");
const multer = require("multer");
const mongoose = require("mongoose");
const Grid = require("gridfs-stream");
const { GridFsStorage } = require("multer-gridfs-storage");
const { Socket } = require('socket.io');
const mongoURI = process.env.DATABASE_URL;
// Initialize gfs
const conn = mongoose.createConnection(mongoURI);
let gfs;
conn.once("open", () => {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection("uploads");
});
const db = client.db();
const bucket = new mongodb.GridFSBucket(db, { bucketName: "uploads" });
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    const sno = req.body;
    return {
      filename: file.originalname,
      bucketName: "uploads",
      metadata: {
        F_ID: sno,
        uploadedBy: req.body.uploadedBy || "Unknown",
      },
      contentType: file.mimetype,
    };
  },
});

const uploadMulter = multer({ storage });

//LeadsMaster apis
const collection = client.db().collection('Leads');
const nCollection = client.db().collection('Notifications');
const sCollection = client.db().collection('Status');
const pCollection = client.db().collection('Products');
const uCollection = client.db().collection('Users');
const lpCollection = client.db().collection('LeadProducts');
const fCollection = client.db().collection('FollowUp');
const tCollection = client.db().collection('Tasks');
const ESRIProductCollection = client.db().collection("VendorESRIClientProduct");
const MLSoftwareRecords = client.db().collection("MLSoftwaresRecords");
const PaymentDetails = client.db().collection("Payment");
const uploadfile = client.db().collection("uploads.files");


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
  // If both are null or undefined, return true
  if (arr1 == null && arr2 == null) {
    return true;
  }

  // If one is null/undefined and the other is not, return false
  if (arr1 == null || arr2 == null) {
    return false;
  }

  // Ensure both are arrays, return false if not
  if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
    return false;
  }

  // Compare lengths of arrays
  if (arr1.length !== arr2.length) return false;

  // Compare each element in the arrays
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

module.exports = (io) => {
  const router = express.Router();
  router.get("/", async (req, res) => {
    return res.status(200).json({ msg: `API starts running` });
  });

  // router.get('/login', async (req, res) => res.sendStatus(405));
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await uCollection.findOne({ username: username, password: password });
      if (!user) {
        return res.status(404).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { uid: user.UID, userType: user.userType },
        SECRET_KEY,
        { expiresIn: '1hr' }
      );

      res.json({
        token,
        user: {
          UID: user.UID,
          uName: user.uName,
          userType: user.userType,
          uStatus: user.uStatus,
        }
      });

    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.get('/verifyToken', async (req, res) => res.sendStatus(405));
  router.post('/verifyToken', verifyToken, async (req, res) => {
    try {
      res.status(200).send({status:"Ok",msg:"verify successfully"});

    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.get('/leadsCount', async (req, res) => res.sendStatus(405));
  router.post('/leadsCount', verifyToken, async (req, res) => {
    try {
      const uid = req.user.uid;
      const userType = req.user.userType;

      const user = await uCollection.findOne({ UID: uid });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // const userType = user.userType;
      const pipeline = leadCountPipeline(userType, uid);

      const data = await lpCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));
    } catch (err) {
      console.error('Error fetching lead counts', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/productleadCount', async (req, res) => res.sendStatus(405));
  router.post('/productleadCount', verifyToken, async (req, res) => {
    try {
      const uid = req.user.uid;
      const userType = req.user.userType;

      const user = await uCollection.findOne({ UID: uid });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // const userType = user.userType;
      const pipeline = productLeadCountPipeline(userType, uid);

      const data = await lpCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));
    } catch (err) {
      console.error('Error fetching product lead counts', err);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/leadData', async (req, res) => res.sendStatus(405));
  router.post('/leadData', verifyToken, async (req, res) => {
    try {
      const uid = req.user.uid;
      const { pid } = req.body;

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

  router.get('/notifications', async (req, res) => res.sendStatus(405));
  router.post('/notifications', verifyToken, async (req, res) => {
    try {
      const data = await nCollection.find({}).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.put('/readNotification', verifyToken, async (req, res) => {
    const { notificationId, userId } = req.body;

    try {
      await nCollection.updateOne(
        { _id: new ObjectId(notificationId), 'targetUsers.uid': userId },
        { $set: { 'targetUsers.$.hasRead': true } }
      );

      res.status(200).send('Notification updated successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.get('/status', async (req, res) => res.sendStatus(405));
  router.post('/status', verifyToken, async (req, res) => {
    try {
      const data = await sCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/products', async (req, res) => res.sendStatus(405));
  router.post('/products', verifyToken, async (req, res) => {
    try {
      const data = await pCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/users', async (req, res) => res.sendStatus(405));
  router.post('/users', verifyToken, async (req, res) => {
    try {
      const data = await uCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.post('/addUser', verifyToken, async (req, res) => {
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

  router.put('/editUser', verifyToken, async (req, res) => {
    try {
      const { UID, data } = req.body;
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
  router.post('/leadDetails', verifyToken, async (req, res) => {
    try {
      const data = await collection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/productDetails', async (req, res) => res.sendStatus(405));
  router.post('/productDetails', verifyToken, async (req, res) => {
    try {
      const data = await lpCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.get('/followUpDetails', async (req, res) => res.sendStatus(405));
  router.post('/followUpDetails', verifyToken, async (req, res) => {
    try {
      const data = await fCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.post('/addLead', verifyToken, async (req, res) => {
    try {
      const data = req.body;

      // const query = {
      //   name: data.name,
      //   organizationName: data.organizationName,
      //   $or: []
      // };

      // if (data.contact?.mobileNo) {
      //   query.$or.push({ 'contact.mobileNo': data.contact.mobileNo });
      // }

      // if (data.contact?.emailID) {
      //   query.$or.push({ 'contact.emailID': data.contact.emailID });
      // }

      // if (query.$or.length === 0) {
      //   delete query.$or;
      // }

      // const existingLeadByName = await collection.findOne(query);
      // if (existingLeadByName) {
      //   return res.status(400).send('This lead already exists.');
      // }

      // const existingLeadOrContact = await collection.findOne({
      //   $or: [
      //     { 'name': data.name },
      //     { 'contact.mobileNo': data.contact?.mobileNo },
      //     { 'contact.emailID': data.contact?.emailID }
      //   ].filter(Boolean)
      // });

      // if (existingLeadOrContact) {
      //   if (existingLeadOrContact.contact?.mobileNo === data.contact?.mobileNo) {
      //     return res.status(400).send('This mobile number already exists.');
      //   }
      //   if (existingLeadOrContact.contact?.emailID === data.contact?.emailID) {
      //     return res.status(400).send('This email address already exists.');
      //   }
      // }

      const query = { name: data.name };

      if (data.contact?.mobileNo) {
        query['contact.mobileNo'] = data.contact.mobileNo;
      }
      if (data.contact?.emailID) {
        query['contact.emailID'] = data.contact.emailID;
      }
  
      const duplicateContactOrEmail = await collection.findOne({
        $or: [
          data.contact?.mobileNo ? { 'contact.mobileNo': data.contact.mobileNo } : null,
          data.contact?.emailID ? { 'contact.emailID': data.contact.emailID } : null,
        ].filter(Boolean),
      });
  
      if (duplicateContactOrEmail) {
        if (duplicateContactOrEmail.contact?.mobileNo === data.contact?.mobileNo) {
          return res.status(400).send('This mobile number already exists.');
        }
        if (duplicateContactOrEmail.contact?.emailID === data.contact?.emailID) {
          return res.status(400).send('This email address already exists.');
        }
      }

      const nextLID = await getNextSequence("LID");
      const lead = {
        LID: parseInt(nextLID),
        name: data.name,
        organizationName: data.organizationName,
        contact: data.contact,
      };

      if (data.designationDept != null && data.designationDept !== '') {
        lead.designationDept = data.designationDept;
      }

      if (data.address != null && data.address !== '') {
        lead.address = data.address;
      }

      const istDate = new Date();
      const utcDate = new Date(istDate.getTime() - istDate.getTimezoneOffset() * 60000);

      const productDetails = {
        LID: parseInt(nextLID),
        PID: data.PID,
        SID: data.SID,
        UID: data.UID,
        source: data.source,
        createdOn: utcDate,
      };

      await collection.insertOne(lead);
      await lpCollection.insertOne(productDetails);

      res.status(200).send('Lead inserted successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editLead', verifyToken, async (req, res) => {
    try {
      const { lid, editLeadData } = req.body;
      const LID = Number(lid);
      const data = editLeadData;

      const lead = await collection.findOne({ LID });

      if (!lead) {
        return res.status(404).send('Lead not found.');
      }

      const conditions = [
        ...(data.contact?.mobileNo ? [{ "contact.mobileNo": data.contact.mobileNo }] : []),
        ...(data.contact?.emailID ? [{ "contact.emailID": data.contact.emailID }] : []),
        ...(data.name ? [{ name: data.name }] : []),
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

      // if (data.contact) {
      //   const contactUpdate = {};
      //   if (data.contact.mobileNo !== lead.contact?.mobileNo) {
      //     contactUpdate.mobileNo = data.contact.mobileNo;
      //   }
      //   if (data.contact.emailID !== lead.contact?.emailID) {
      //     contactUpdate.emailID = data.contact.emailID;
      //   }
      //   if (Object.keys(contactUpdate).length > 0) {
      //     updatedFields.contact = contactUpdate;
      //   }
      // }

      if (data.contact) {
        const contactUpdate = {};
      
        if (data.contact.mobileNo !== undefined && data.contact.mobileNo !== lead.contact?.mobileNo) {
          contactUpdate.mobileNo = data.contact.mobileNo;
        } else if (data.contact.mobileNo === '') {
          contactUpdate.mobileNo = null; // Explicitly set to null if empty
        } else {
          contactUpdate.mobileNo = lead.contact?.mobileNo; // Retain existing value
        }
      
        if (data.contact.emailID !== undefined && data.contact.emailID !== lead.contact?.emailID) {
          contactUpdate.emailID = data.contact.emailID;
        } else if (data.contact.emailID === '') {
          contactUpdate.emailID = null; // Explicitly set to null if empty
        } else {
          contactUpdate.emailID = lead.contact?.emailID; // Retain existing value
        }
      
        updatedFields.contact = {
          ...lead.contact, // Retain existing fields
          ...contactUpdate, // Apply updates
        };
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

  router.post('/addProduct', verifyToken, async (req, res) => {
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

  router.post('/addNewProduct', verifyToken, async (req, res) => {
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

      // io.emit('newProduct', productDetails.PID);

      res.status(200).send('Product added successfully');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });

  router.put('/editProduct', verifyToken, async (req, res) => {
    try {
      const { PID, data } = req.body;
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

  router.post('/addFollowUp', verifyToken, async (req, res) => {
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
  router.post('/tasks', verifyToken, async (req, res) => {
    try {
      const pipeline = fetchTasksPipeline;
      const data = await tCollection.aggregate(pipeline).toArray();
      res.json(encryptData(data));
    } catch (error) {
      console.error(error)
      res.status(500).send('Server Error');
    }
  });

  router.post('/addTask', verifyToken, async (req, res) => {
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

  router.put('/editTask', verifyToken, async (req, res) => {
    try {
      const { TID, data } = req.body;
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

  router.put('/editFollowUp', verifyToken, async (req, res) => {
    try {
      const { FID, data } = req.body;

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

  router.post('/importLead', verifyToken, upload.single('file'), importLead);

  router.get('/getESRIProduct', async (req, res) => res.sendStatus(405));
  router.post("/getESRIProduct", verifyToken, async (req, res) => {
    try {
      const data = await ESRIProductCollection.find({ SNO: { $ne: 0 } }).toArray();
  
      // Fetch all SNO values from data
      const snoList = data.map((item) => String(item.SNO));
  
      // Fetch associated files from fileupload collection
      const fileData = await uploadfile.aggregate([
        { $match: { "metadata.F_ID.SNO": { $in: snoList } } },
        {
          $group: {
            _id: "$metadata.F_ID.SNO",
            hasPO: { $max: { $cond: [{ $eq: ["$metadata.F_ID.docType", "PODocument"] }, true, false] } },
            hasIC: { $max: { $cond: [{ $eq: ["$metadata.F_ID.docType", "InstallationCertificate"] }, true, false] } },
          },
        },
      ]).toArray();
  
      // Convert fileData into a lookup object for fast access
      const fileLookup = fileData.reduce((acc, file) => {
        acc[file._id] = { hasPO: file.hasPO, hasIC: file.hasIC };
        return acc;
      }, {});
  
      // Merge file existence info into ESRI products data
      const updatedData = data.map((product) => ({
        ...product,
        hasPO: fileLookup[product.SNO]?.hasPO || false,
        hasIC: fileLookup[product.SNO]?.hasIC || false,
      }));
  
      res.status(200).json(encryptData(updatedData));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.get('/getLastIndexESRIProduct', async (req, res) => res.sendStatus(405));
  router.post("/getLastIndexESRIProduct", verifyToken, async (req, res) => {
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

  router.post("/insertESRIProduct", verifyToken, async (req, res) => {
    const formData = req.body.formData;
    const SNO = req.body.SNO;
    formData.SNO = SNO;
    try {
      const existingRecord = await ESRIProductCollection.findOne({
        PONumber: formData.PONumber,
      });
  
      if (existingRecord) {
        return res.status(400).send("PO Number already exists.");
      }

      await ESRIProductCollection.insertOne(formData);
      res.status(200).json({ msg: "Record insert successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.post("/updateESRIProduct", verifyToken, async (req, res) => {

    const data = req.body.data;
    const sno = req.body.SNO;
    const filter = { SNO: sno }

    try {
      const existingRecord = await ESRIProductCollection.findOne({
        PONumber: data.PONumber,
        SNO: { $ne: sno },
      });
      
      if (existingRecord) {
        return res.status(400).send("PO Number already exists." );
      }
      
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

      const result = await ESRIProductCollection.updateOne(filter, update);
      res.status(200).json({ count: result.modifiedCount, msg: "Record insert successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.post("/uploadDoc", verifyToken, uploadMulter.single("file"), (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).send("No file uploaded");
    }
    res.status(200).json({
      message: "File uploaded to GridFS successfully",
    });
  });

  router.get('/view', async (req, res) => res.sendStatus(405));
  router.post("/view", verifyToken, async (req, res) => {
    const fid = req.body.fid;
    const docType = req.body.docType;

    try {
        const cursor = bucket
            .find({ 
                "metadata.F_ID.SNO": `${fid}`,
                "metadata.F_ID.docType": docType
            })
            .sort({ uploadDate: -1 })
            .limit(1);

        const files = await cursor.toArray();

        if (files.length === 0) {
            return res.status(404).send("File not found!");
        }

        const fileId = new ObjectId(`${files[0]._id}`);
        const downloadStream = bucket.openDownloadStream(fileId);

        // Set headers to display the file in browser
        res.setHeader("Content-Type", files[0].contentType || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="${files[0].filename}"`);

        // Pipe file stream directly to response
        downloadStream.pipe(res);
    } catch (error) {
        console.error("Error fetching file:", error);
        res.status(500).send("An error occurred while fetching the file.");
    }
});


  router.get('/download', async (req, res) => res.sendStatus(405));
  router.post("/download", verifyToken, async (req, res) => {
    const fid = req.body.fid;
    const docType = req.body.docType;
    const fs = require("fs");
    const path = require("path");
    const cursor = bucket
      .find({ 
        "metadata.F_ID.SNO": `${fid}`,
        "metadata.F_ID.docType": docType,
      })
      .sort({ uploadDate: -1 })
      .limit(1);
    const files = await cursor.toArray();
    // console.log(files.length);
    if (files.length !== 0) {
      const fileId = new ObjectId(`${files[0]._id}`);
      const downloadStream = bucket.openDownloadStream(fileId);
      const tempFilePath = path.join(__dirname, `../${files[0].filename}`);
      const localFileWriteStream = fs.createWriteStream(
        `./${files[0].filename}`
      );
      downloadStream
        .pipe(localFileWriteStream)
        .on("error", function (err) {
          console.error("Error while downloading the file:", err);
          res.status(500).send("An error occurred while downloading the file");
        })
        .on("finish", function () {
          res.download(tempFilePath, `${files[0].filename}`, (err) => {
            if (err) {
              res.status(500).send("Error occurred while downloading the file");
            } else {
              fs.unlink(tempFilePath, (err) => {
                if (err) {
                  console.error("Error deleting temp file:", err);
                } else {
                  // console.log("Temporary file deleted successfully");
                }
              });
            }
          });
        });
    } else {
      res.status(404).send("Records not found!");
    }
  });

  router.get('/getSoftwareProduct', async (req, res) => res.sendStatus(405));
  router.post("/getSoftwareProduct", verifyToken, async (req, res) => {
    try {
      const data = await MLSoftwareRecords.find({
        SNO: { $ne: 0 },
      }).toArray();
      res.status(200).json(encryptData(data));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });


  router.get('/updateMLSoftwareProduct', async (req, res) => res.sendStatus(405));
  router.post("/updateMLSoftwareProduct", verifyToken, async (req, res) => {

    const data = req.body.data;
    const sno = req.body.SNO;
    const filter = { SNO: sno }

    const update = {
      $set: {
        //SNO:data.SNO,
        VendorName: data.VendorName,
        VendorAddress: data.VendorAddress,
        City: data.City,
        State: data.State,
        SubscriptionFor: data.SubscriptionFor,
        SubscriptionDescription: data.SubscriptionDescription,
        SubscriptionAmount: data.SubscriptionAmount,
        SubscriptionDate: data.SubscriptionDate,
        SubscriptionTenure: data.SubscriptionTenure,
        RenewalDueDate: data.RenewalDueDate,
      },
    };

    // const softwareDetails={
    //   SNO:data.SNO,
    //   subscriptionDate:data.SubscriptionDate,
    //   RenewalDueDate: data.RenewalDueDate,
    //   SubscriptionFor:data.SubscriptionFor
    // };
    try {
      // if(data.VendorName.length>0){
      //   scheduleRenualReminders(softwareDetails);
      // } 
      const result = await MLSoftwareRecords.updateOne(filter, update);
      res.status(200).json({ count: result.modifiedCount, msg: "Record updated successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.get('/getLastIndexMLProduct', async (req, res) => res.sendStatus(405));
  router.post("/getLastIndexMLProduct", verifyToken, async (req, res) => {
    try {
      const data = await MLSoftwareRecords.find()
        .sort({ SNO: -1 })
        .limit(1)
        .toArray();
      res.status(200).json(encryptData(data[0].SNO));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.get('/insertMLProduct', async (req, res) => res.sendStatus(405));
  router.post("/insertMLProduct", verifyToken, async (req, res) => {
    const data = req.body;
    try {
      // Fetch the last SNO
      const lastRecord = await MLSoftwareRecords.find()
        .sort({ SNO: -1 })
        .limit(1)
        .toArray();

      const newSNO = lastRecord.length > 0 ? lastRecord[0].SNO + 1 : 1; // Start from 1 if no records exist

      // Insert new record with the new SNO
      const newData = { ...data, SNO: newSNO };
      await MLSoftwareRecords.insertOne(newData);

      const softwareDetails = {
        SNO: newSNO,
        subscriptionDate: data.SubscriptionDate,
        RenewalDueDate: data.RenewalDueDate,
        SubscriptionFor: data.SubscriptionFor
      };

      // if (data.VendorName.length > 0) {
      //   scheduleRenualReminders(softwareDetails);
      // }
      res.status(200).json({ msg: "Record inserted successfully!", SNO: newSNO });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });


  router.get('/getPaymentDetails', async (req, res) => res.sendStatus(405));
  router.post("/getPaymentDetails", verifyToken, async (req, res) => {

    try {
      const data = await PaymentDetails.find({
        SNO: { $ne: 0 },
      }).toArray();
      res.status(200).json(encryptData(data));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });


  router.get('/updateMLPaymentDetails', async (req, res) => res.sendStatus(405));
  router.post("/updateMLPaymentDetails", verifyToken, async (req, res) => {

    const data = req.body.data;
    const sno = req.body.SNO;
    const filter = { SNO: sno }

    const update = {
      $set: {
        //SNO:data.SNO,
        Project: data.Project,
        RedingtonInvoice: data.RedingtonInvoice,
        RedingtonInvoiceDate: data.RedingtonInvoiceDate,
        CreditDays: data.CreditDays,
        AdvanceChequeDate: data.AdvanceChequeDate,
        ChequeAmount: data.ChequeAmount,
        ChequeNumber: data.ChequeNumber,
        Drawnon: data.Drawnon,
        Paymentfrom: data.Paymentfrom,
      },
    };

    try {

      const result = await PaymentDetails.updateOne(filter, update);
      res.status(200).json({ count: result.modifiedCount, msg: "Record updated successfully!" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });


  router.get('/getLastIndexPayment', async (req, res) => res.sendStatus(405));
  router.post("/getLastIndexPayment", verifyToken, async (req, res) => {
    try {
      const data = await PaymentDetails.find()
        .sort({ SNO: -1 })
        .limit(1)
        .toArray();
      res.status(200).json(encryptData(data[0].SNO));
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  router.get('/insertPaymentDetails', async (req, res) => res.sendStatus(405));
  router.post("/insertPaymentDetails", verifyToken, async (req, res) => {
    const data = req.body;
    try {
      // Fetch the last SNO
      const lastRecord = await PaymentDetails.find()
        .sort({ SNO: -1 })
        .limit(1)
        .toArray();

      const newSNO = lastRecord.length > 0 ? lastRecord[0].SNO + 1 : 1; // Start from 1 if no records exist

      // Insert new record with the new SNO
      const newData = { ...data, SNO: newSNO };
      await PaymentDetails.insertOne(newData);

      res.status(200).json({ msg: "Record inserted successfully!", SNO: newSNO });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  });

  return router;

};