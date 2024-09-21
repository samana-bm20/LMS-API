require("dotenv").config();
const express = require("express");
const http = require('http'); 
// const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const { connectToMongoDB } = require('./config/database');
const apiRoutes = require("./routes/api");
const PORT = process.env.PORT;

const app = express();
const server = http.createServer(app); // Create HTTP server

app.use(express.json());
app.use(cors());
app.options('*', cors());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Initialize Socket.IO with the HTTP server
// const io = socketIO(server, {
//   cors: {
//     origin: '*', // You can restrict this to specific origins for security
//     methods: ['GET', 'POST']
//   }
// });

connectToMongoDB();

app.use('/', apiRoutes());
// app.use('/', apiRoutes(io));

// Socket.IO event handling
// io.on('connection', (socket) => {
//   console.log('A user connected:', socket.id);

//   // Assuming the client sends UID upon connection to assign the user to a room
//   socket.on('joinRoom', (UID) => {
//     socket.join(UID); // Join a room with the user's UID
//     console.log(`User with UID: ${UID} joined room: ${UID}`);
//   });

//   // Handle other events...
  
//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.id);
//   });
// });

// Export the io instance to use in other modules
// module.exports = { io };

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
