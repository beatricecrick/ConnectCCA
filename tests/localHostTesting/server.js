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

// Serve addMembers.html
app.get("/addMembers.html", (req, res) => {
    res.sendFile(__dirname + "/addMembers.html");
});

// Handle real-time chat
io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (data) => {
        users[socket.id] = { classInfo: data.classInfo, userName: data.userName, userId: data.userId };
        console.log(`${socket.id} joined class ${data.classInfo} as ${data.userName}`);
    });

    socket.on('chat message', (msg, chat) => {
        const user = users[socket.id];
        if (user) {
            io.emit('chat message', { msg, chat, userName: user.userName });
            saveMessageToFirestore(msg, chat, user.userName); // Store message in Firestore with username
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        delete users[socket.id];
    });
});

// Save message to Firebase Firestore
async function saveMessageToFirestore(msg, chat, userName) {
    try {
        const chatRef = db.collection("chats").doc(chat).collection("messages");
        await chatRef.add({
            message: msg,
            userName: userName,
            timestamp: new Date(),
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
//Check for users as a querey
app.get('/searchUsers', async (req, res) => {
    const { query } = req.query;
    console.log("Received search query:", query);
    try {
        const snapshot = await db.collection('users').get();
        const usersList = snapshot.docs.map(doc => doc.data().name);
        const filteredUsers = usersList.filter(user => user.toLowerCase().startsWith(query.toLowerCase()));
        res.json(filteredUsers);
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// Check if a location exists
app.get('/checkLocation', async (req, res) => {
    const { locationName } = req.query;
    console.log("Received request to check location:", locationName);
    try {
        const locationRef = db.collection('locations').doc(locationName);
        const doc = await locationRef.get();
        res.json({ exists: doc.exists });
    } catch (error) {
        console.error('Error checking location:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create the location and update users' chats
app.post('/createLocation', async (req, res) => {
    const { locationName, members } = req.body;
    console.log("Received request to create location:", req.body);
    try {
        const locationRef = db.collection('locations').doc(locationName);
        const doc = await locationRef.get();
        if (doc.exists) {
            console.log("LOCATION ALREADY EXISTS");
            return res.status(400).json({ error: 'Location already exists' });
        }
        console.log("LOCATION AVAILABLE");
        await locationRef.set({
            name: locationName,
            members: members,
            timestamp: new Date(),
        });

        // Update users' chats
        const batch = db.batch();
        members.forEach(member => {
            const userRef = db.collection('users').doc(member);
            batch.update(userRef, {
                chats: admin.firestore.FieldValue.arrayUnion(locationName)
            });
        });
        await batch.commit();

        res.json({ locationId: locationRef.id });
    } catch (error) {
        console.error('Error creating location:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get chats for a user
app.get('/getChats', async (req, res) => {
    const { userName } = req.query;
    console.log("Received request to get chats for user:", userName);
    try {
        const userRef = db.collection('users').doc(userName);
        const doc = await userRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        const userData = doc.data();
        res.json(userData.chats || []);
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get messages for a chat
app.get('/getMessages', async (req, res) => {
    const { chat } = req.query;
    console.log("Received request to get messages for chat:", chat);
    try {
        const snapshot = await db.collection('chats').doc(chat).collection('messages').orderBy('timestamp').get();
        const messages = snapshot.docs.map(doc => doc.data());
        res.json(messages);
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

//for vercel
module.exports = app;