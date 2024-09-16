const cron = require('node-cron');
const nodemailer = require('nodemailer');

const { client } = require('../config/database');

// Collections
const uCollection = client.db().collection('Users');
const collection = client.db().collection('Leads');
const pCollection = client.db().collection('Products');

// Schedule task reminders
const scheduleTaskReminders = (taskDetails, taskDate) => {
  const { reminder, title, description, UID, LID, PID } = taskDetails;

  if (!reminder || reminder.length === 0) {
    console.log("No reminders set for this task.");
    return;
  }

  reminder.forEach(rem => {
    const { notificationTypes, frequencyValue, frequencyUnit } = rem;

    if (!frequencyValue || !frequencyUnit) {
      console.error(`Invalid reminder settings for task "${title}". Skipping.`);
      return;
    }

    const reminderTime = calculateReminderTime(taskDate, frequencyValue, frequencyUnit);

    if (reminderTime <= new Date()) {
      console.warn(`Reminder time for task "${title}" is in the past. Skipping scheduling.`);
      return;
    }

    if (notificationTypes.includes('email')) {
      scheduleEmailReminder(title, reminderTime, UID, description, taskDate, LID, PID);
    }
  });
};

// Calculate reminder time based on task date and frequency
const calculateReminderTime = (taskDate, frequencyValue, frequencyUnit) => {
  let reminderTime = new Date(taskDate);
  frequencyValue = Number(frequencyValue);

  if (frequencyUnit === 'Minutes') {
    reminderTime.setMinutes(reminderTime.getMinutes() - frequencyValue);
  } else if (frequencyUnit === 'Hours') {
    reminderTime.setHours(reminderTime.getHours() - frequencyValue);
  } else if (frequencyUnit === 'Days') {
    reminderTime.setDate(reminderTime.getDate() - frequencyValue);
  } else if (frequencyUnit === 'Weeks') {
    reminderTime.setDate(reminderTime.getDate() - frequencyValue * 7);
  }

  return reminderTime;
};

// Schedule the email reminder using cron
const scheduleEmailReminder = (taskTitle, reminderTime, UID, taskDescription, taskDate, LID, PID) => {
  if (reminderTime <= new Date()) {
    console.error(`Reminder time for task "${taskTitle}" is in the past. Skipping scheduling.`);
    return;
  }

  const cronTime = `${reminderTime.getMinutes()} ${reminderTime.getHours()} ${reminderTime.getDate()} ${reminderTime.getMonth() + 1} *`;
  cron.schedule(cronTime, async () => {
    try {

      const userEmail = await getUserEmail(UID);
      
      const leadName = LID ? await getLeadName(LID) : 'Not Assigned';
      const productName = PID ? await getProductName(PID) : 'Not Assigned';


      if (userEmail) {
        sendEmailReminder(taskTitle, userEmail, taskDescription, taskDate, leadName, productName);
      } else {
        console.error('No email found for this user.');
      }
    } catch (error) {
      console.error('Error during email reminder:', error);
    }
  });
};

// Send email reminder using nodemailer
const sendEmailReminder = async (taskTitle, userEmail, taskDescription, taskDate, leadName, productName) => {
  let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'post@mlinfomap.com',
      pass: 'st#op1993',
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  let mailOptions = {
    from: 'post@mlinfomap.com',
    to: userEmail,
    subject: `Reminder for Task: ${taskTitle}`,
    html: `
      <h2>Reminder for Task: ${taskTitle}</h2>
      <p><strong>Due Time:</strong> ${new Date(taskDate).toLocaleString()}</p>
      ${leadName && leadName !== 'Not Assigned' ? `<p><strong>Lead Name:</strong> ${leadName}</p>` : ''}
      ${productName && productName !== 'Not Assigned' ? `<p><strong>Product:</strong> ${productName}</p>` : ''}
      <p><strong>Description:</strong> ${taskDescription}</p>
      <p>Please make sure to complete the task before the due time.</p>
      <p>Thank you!</p>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    console.log('Email sent: ' + info.response);
  });
};

// Fetch user email based on UID
const getUserEmail = async (UID) => {
  try {
    const user = await uCollection.findOne({ UID });
    if (user && user.email) {
      return user.email;
    } else {
      console.error('Email not found for the user with UID:', UID);
      throw new Error('Email not found');
    }
  } catch (error) {
    console.error('Error fetching user email:', error);
    throw error;
  }
};

// Fetch lead name based on LID
const getLeadName = async (LID) => {
  try {
    const lead = await collection.findOne({ LID: parseInt(LID) });
    if (lead && lead.name) {
      return lead.name;
    } else {
      console.error('Lead name not found for the provided LID:', LID);
      throw new Error('Lead name not found');
    }
  } catch (error) {
    console.error('Error fetching lead name:', error);
    throw error;
  }
};

// Fetch product name based on PID
const getProductName = async (PID) => {
  try {
    const product = await pCollection.findOne({ PID });
    if (product && product.pName) {
      return product.pName;
    } else {
      console.error('Product name not found for the provided PID:', PID);
      throw new Error('Product name not found');
    }
  } catch (error) {
    console.error('Error fetching product name:', error);
    throw error;
  }
};

// Export the necessary functions
module.exports = {
  scheduleTaskReminders
};
