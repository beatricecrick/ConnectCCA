const express = require('express');
const bodyParser = require('body-parser');  // Add body parser to handle POST requests
const { db, admin } = require('./firebase'); // Import Firestore from firebase.js

const app = express();
const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);

// Middleware to parse JSON body
app.use(bodyParser.json());

let users = {}; // Track connected users

// Serve index.html
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
        const user = users[socket.id];
        if (user) {
            io.emit('chat message', { msg, classInfo, userName: user.userName });
            saveMessageToFirestore(msg, classInfo, user.userName); // Store message in Firestore with username
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        delete users[socket.id];
    });
});

// Save message to Firebase Firestore
async function saveMessageToFirestore(msg, classInfo, userName) {
    try {
        const userRef = db.collection("location").doc("userInfo").collection("User Message").doc(userName);
        const doc = await userRef.get();
        if (!doc.exists) {
            await userRef.set({ messages: [] }); // Initialize the document with an empty messages array
        }
        await userRef.update({
            messages: admin.firestore.FieldValue.arrayUnion({
                message: msg,
                class: classInfo,
                timestamp: new Date(),
            })
        });
        console.log('Message appended to Firestore');
    } catch (error) {
        console.error('Error appending message:', error);
    }
}

// Add user to Firestore
app.post('/addUser', async (req, res) => {
    const { userName } = req.body;
    console.log("Received request to add user:", req.body);
    console.log("username", userName);
    try {
        const userRef = db.collection('users').doc(userName);
        const doc = await userRef.get();
        if (doc.exists) {
            console.log("USERNAME ALREADY TAKEN");
            return res.status(400).json({ error: 'Username already taken' });
        }
        console.log("USERNAME AVAILABLE");
        await userRef.set({
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