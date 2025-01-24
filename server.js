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
