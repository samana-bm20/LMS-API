require("dotenv").config();
const express = require("express");
const http = require('http');
const cors = require('cors');
const path = require('path');
const { connectToMongoDB } = require('./config/database');
const apiRoutes = require("./routes/api");
const socketHandler = require('./socket'); // Import the socket handler

const PORT = process.env.PORT;
const SECRET_KEY = process.env.SECRET_KEY;

const app = express();
app.use(express.json());

app.options('*', cors());
app.use(cors());
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'Authorization', 'Content-Disposition'],
  exposedHeaders: ["Content-Disposition"],
}));

app.use('/public', express.static(path.join(__dirname, 'public')));

connectToMongoDB();

const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Initialize socket events
socketHandler(io, SECRET_KEY);

app.use('/', apiRoutes(io));

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

// require("dotenv").config();
// const express = require("express");
// const http = require('http');
// const cors = require('cors');
// const path = require('path');
// const { connectToMongoDB } = require('./config/database');
// const apiRoutes = require("./routes/api");
// const PORT = process.env.PORT;
// const jwt = require('jsonwebtoken');
// const SECRET_KEY = process.env.SECRET_KEY;

// const app = express();
// app.use(express.json());

// app.options('*', cors());
// app.use(cors());
// app.use(cors({
//   origin: '*',
//   allowedHeaders: ['Content-Type', 'Authorization', 'Content-Disposition'],
//   exposedHeaders: ["Content-Disposition"],
// }));

// app.use('/public', express.static(path.join(__dirname, 'public')));

// connectToMongoDB();

// const server = http.createServer(app);
// const io = require('socket.io')(server, {
//   cors: {
//     origin: "http://localhost:5173",
//     methods: ["GET", "POST"]
//   }
// });


// io.use((socket, next) => {
//   const token = socket.handshake.auth.token;
//   if (!token) {
//     return next(new Error('Authentication error'));
//   }

//   jwt.verify(token, SECRET_KEY, (err, decoded) => {
//     if (err) {
//       return next(new Error('Authentication error'));
//     }
//     socket.decoded = decoded;
//     next();
//   });
// });

// const { client } = require('./config/database');
// const nCollection = client.db().collection('Notifications');
// const uCollection = client.db().collection('Users');

// let connectedUsers = {};
// io.on('connection', (socket) => {
//   const uid = socket.decoded.uid;
//   connectedUsers[uid] = socket.id;

//   socket.on("newProduct", async (pName, UID) => {
//     console.log("new product added:", pName);

//     try {
//       const allUsers = await uCollection.find({}).toArray();

//       const targetUsers = allUsers
//         .filter(user => user.UID !== UID)
//         .map(user => ({ uid: user.UID, hasRead: false }));

//       const notificationData = {
//         eventType: 'newProduct',
//         time: new Date(),
//         sentBy: UID,
//         keyword: pName,
//         redirect: 'products',
//         targetUsers: targetUsers
//       }

//       await nCollection.insertOne(notificationData);

//       targetUsers.forEach(target => {
//         if (connectedUsers[target.uid]) {
//           io.to(connectedUsers[target.uid]).emit("receiveNotification");
//         }
//       });

//     } catch (error) {
//       console.error("Error saving notification:", error);
//     }
//   });

//   socket.on("addLead", async (addLeadData, UID) => {
//     console.log("new lead added:", addLeadData);

//     try {
//       const allUsers = await uCollection.find({}).toArray();

//       const targetUsers = {uid: addLeadData.UID, hasRead: false}

//       const notificationData = {
//         eventType: 'addLead',
//         time: new Date(),
//         sentBy: UID,
//         keyword: addLeadData.name,
//         redirect: '/leads',
//         targetUsers: targetUsers
//       }

//       await nCollection.insertOne(notificationData);

//       targetUsers.forEach(target => {
//         if (connectedUsers[target.uid]) {
//           io.to(connectedUsers[target.uid]).emit("receiveNotification");
//         }
//       });

//     } catch (error) {
//       console.error("Error saving notification:", error);
//     }
//   });

//   socket.on('disconnect', () => {
//     delete connectedUsers[uid];
//   });
// });


// app.use('/', apiRoutes(io));

// // Export the io instance to use in other modules
// module.exports = { io };

// server.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}/`);
// });
