const express = require('express');
const bodyParser = require('body-parser');  // Add body parser to handle POST requests
const { db } = require('./firebase'); // Import Firestore from firebase.js

const app = express();
const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);

// Middleware to parse JSON body
app.use(bodyParser.json());

let users = {}; // Track connected users
//get index
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// Handle real-time chat
io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (data) => {
        users[socket.id] = { classInfo: data.classInfo, userName: data.userName, userId: data.userId };
        console.log(`${socket.id} joined class ${data.classInfo} as ${data.userName}`);
    });

    socket.on('chat message', (msg, classInfo) => {
        io.emit('chat message', { msg, classInfo });
        saveMessageToFirestore(msg, classInfo); // Store message in Firestore
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        delete users[socket.id];
    });
});

// Save message to Firebase Firestore
async function saveMessageToFirestore(msg, classInfo) {
    try {
        await db.collection('messages').add({
            message: msg,
            class: classInfo,
            timestamp: new Date(),
        });
        console.log('Message saved to Firestore');
    } catch (error) {
        console.error('Error saving message:', error);
    }
}

// Add user to Firestore
app.post('/addUser', async (req, res) => {
    const { userName } = req.body;
    try {
        const userRef = await db.collection('users').add({
            name: userName,
            timestamp: new Date(),
        });
        res.json({ userId: userRef.id });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Get all users from Firebase
app.get('/getUsers', async (req, res) => {
    try {
        const snapshot = await db.collection('users').get();
        const usersList = snapshot.docs.map(doc => doc.data());
        res.json(usersList);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Internal Server Error');
    }
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

//for vercel
module.exports = app;