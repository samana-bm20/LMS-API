require("dotenv").config();
const express = require("express");
const cors = require('cors');
const path = require('path')
const { connectToMongoDB } = require('./config/database');
const apiRoutes = require("./routes/api");
const PORT = process.env.PORT;

const app = express();
app.use(express.json());


app.use(cors());
app.options('*', cors())
app.use('/public', express.static(path.join(__dirname, 'public')));

connectToMongoDB();

app.use('/', apiRoutes);

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
