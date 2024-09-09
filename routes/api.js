const express = require('express');
const router = express.Router();
const { client } = require('../config/database');

//import pipelines
const leadPIDPipeline = require('../pipelines/leadPIDPipeline');
const leadCountPipline = require('../pipelines/leadCountPipeline');
const productLeadCountPipeline = require('../pipelines/productCountPipeline');
const fetchTasksPipeline = require('../pipelines/fetchTasksPipeline')
const { upload, importLead} = require('../pipelines/insertImportLead')

//LeadsMaster apis
const collection = client.db().collection('Leads');
const sCollection = client.db().collection('Status');
const pCollection = client.db().collection('Products');
const uCollection = client.db().collection('Users');
const lpCollection = client.db().collection('LeadProducts');
const fCollection = client.db().collection('FollowUp');
const tCollection = client.db().collection('Tasks');

const getNextSequence = async (name) => {
  const next = await client.db().collection('Counter').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return next.seq;
}

router.get('/leads-count', async (req, res) => {
  try {
    const leadCount = leadCountPipline;
    const result = await lpCollection.aggregate(leadCount).toArray();
    res.json(result);
  } catch (err) {
    console.error('Error fetching leads status:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/productlead-count', async (req, res) => {
  try {
    const productLeadCount = productLeadCountPipeline;
    const result = await lpCollection.aggregate(productLeadCount).toArray();
    res.json(result);
  } catch (err) {
    console.error('Error fetching leads status:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/leadData/:pid', async (req, res) => {
  try {
    const pid = req.params.pid;
    const pipeline = leadPIDPipeline(pid);
    const leads = await lpCollection.aggregate(pipeline).toArray();
    res.json(leads);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/status', async (req, res) => {
  try {
    const status = await sCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
    res.json(status);
  } catch (error) {
    console.error(error)
    res.status(500).send('Server Error');
  }
});

router.get('/products', async (req, res) => {
  try {
    const products = await pCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
    res.json(products);
  } catch (error) {
    console.error(error)
    res.status(500).send('Server Error');
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await uCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
    res.json(users);
  } catch (error) {
    console.error(error)
    res.status(500).send('Server Error');
  }
});

router.get('/leadDetails', async (req, res) => {
  try {
    const lead = await collection.aggregate([{ $project: { _id: 0 } }]).toArray();
    res.json(lead);
  } catch (error) {
    console.error(error)
    res.status(500).send('Server Error');
  }
});

router.get('/productDetails', async (req, res) => {
  try {
    const leadProduct = await lpCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
    res.json(leadProduct);
  } catch (error) {
    console.error(error)
    res.status(500).send('Server Error');
  }
});

router.get('/followUpDetails', async (req, res) => {
  try {
    const followUp = await fCollection.aggregate([{ $project: { _id: 0 } }]).toArray();
    res.json(followUp);
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

    await tCollection.insertOne(taskDetails);

    res.status(200).send('Task added successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/tasks', async (req, res) => {
  try {
    const pipeline = fetchTasksPipeline;
    const tasks = await tCollection.aggregate(pipeline).toArray();
    res.json(tasks);
  } catch (error) {
    console.error(error)
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

    // If no fields have changed, don't update
    if (Object.keys(editHistory).length === 2) {
      return res.status(400).send('No changes detected.');
    }

    await tCollection.updateOne(
      { TID },
      {
        $set: {
          ...(data.taskDate && { taskDate: currentTaskDate }),
          ...(data.UID && { UID: data.UID }),
          ...(data.taskStatus && { taskStatus: data.taskStatus }),
        },
        $push: {
          edits: editHistory
        }
      }
    );

    res.status(200).send('Task updated successfully.');
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

    res.status(200).send('Follow-up updated successfully.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/importLead', upload.single('file'), importLead);


module.exports = router;