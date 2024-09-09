require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.DATABASE_URL;
const client = new MongoClient(url); 

async function connectToMongoDB() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
}

module.exports = { client, connectToMongoDB };
