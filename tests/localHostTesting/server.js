const express = require('express');
const bodyParser = require('body-parser');  // Add body parser to handle POST requests
const { db, admin } = require('./firebase'); // Import Firestore from firebase.js
const bcrypt = require('bcrypt'); // For password hashing

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

    socket.on('chat message', async (msg, chat) => {
        const user = users[socket.id];
        if (user && chat) {
            io.emit('chat message', { msg, chat, userName: user.userName });
            await saveMessageToFirestore(msg, chat, user.userName); // Store message in Firestore with username

            // Add an information string for each user in the "public" chat
            if (chat === 'public') {
                const userInfoRef = db.collection('locations').doc('public').collection('users').doc(user.userName);
                const userInfoDoc = await userInfoRef.get();
                if (!userInfoDoc.exists) {
                    await userInfoRef.set({
                        info: ''
                    });
                }
            }
        } else {
            console.error('Error: User or chat is not defined');
            console.log('User:', user);
            console.log('Chat:', chat);
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
        if (!chat) {
            throw new Error('Chat is not defined');
        }
        const timestamp = new Date().toISOString();
        const messageId = `${userName}_${timestamp}`;
        const chatRef = db.collection("locations").doc(chat).collection("users").doc(userName).collection("messages").doc(messageId);
        await chatRef.set({
            message: msg,
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });
        console.log('Message appended to Firestore');
    } catch (error) {
        console.error('Error appending message:', error);
    }
}

// Add user to Firestore
app.post('/createUser', async (req, res) => {
    const { userName, password } = req.body;
    console.log("Received request to create user:", req.body);
    try {
        const userRef = db.collection('users').doc(userName);
        const doc = await userRef.get();
        if (doc.exists) {
            console.log("USERNAME ALREADY TAKEN");
            return res.status(400).json({ error: 'Username already taken' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await userRef.set({
            name: userName,
            password: hashedPassword,
            info: '',
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });
        const userChatRef = userRef.collection('chats');
        const publicChatDoc = await userChatRef.doc('public').get();
        if (!publicChatDoc.exists) {
            await userChatRef.doc('public').set({
                locationName: 'public',
                time: new Date(),
                date: new Date().toLocaleDateString(),
            });
        }

        // Ensure "Public Chat" exists in the locations collection
        const publicLocationRef = db.collection('locations').doc('public');
        const publicLocationDoc = await publicLocationRef.get();
        if (!publicLocationDoc.exists) {
            await publicLocationRef.set({
                name: 'public',
                info: 'Public chat for all users',
                settings: {},
                time: new Date(),
                date: new Date().toLocaleDateString(),
            });
        }

        res.json({ userId: userRef.id });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Authenticate user
app.post('/login', async (req, res) => {
    const { userName, password } = req.body;
    console.log("Received login request:", req.body);
    try {
        const userRef = db.collection('users').doc(userName);
        const doc = await userRef.get();
        if (!doc.exists) {
            return res.json({ newUser: true });
        }
        const userData = doc.data();
        const passwordMatch = await bcrypt.compare(password, userData.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        res.json({ userId: userRef.id });
    } catch (error) {
        console.error('Error logging in:', error);
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

// Search users
app.get('/searchUsers', async (req, res) => {
    const { query } = req.query;
    console.log("Received request to search users:", query);

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        const snapshot = await db.collection('users').get();
        const users = snapshot.docs.map(doc => doc.id).filter(userName => userName.toLowerCase().includes(query.toLowerCase()));
        res.json(users);
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
            info: '',
            settings: {},
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });

        // Add users to the location and update their chats
        const batch = db.batch();
        members.forEach(member => {
            const userRef = locationRef.collection('users').doc(member);
            batch.set(userRef, {
                info: '',
                settings: {},
            });


            console.log("Added user:", member);
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
        const snapshot = await userRef.collection('chats').get();
        const chats = snapshot.docs.map(doc => doc.id);
        res.json(chats);
    } catch (error) {
        console.error('Error getting chats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get messages for a chat
app.get('/getMessages', async (req, res) => {
    const { chat } = req.query;
    console.log("Received request to get messages for chat:", chat);
    
    // Validate chat
    if (!chat) {
        return res.status(400).json({ error: 'Chat is required' });
    }

    try {
        const usersSnapshot = await db.collection('locations').doc(chat).collection('users').get();
        console.log("chat:", chat);
        console.log("Users in chat:", usersSnapshot.docs.map(doc => doc.id));
        console.log("Users snapshot:", usersSnapshot.docs);
        let messages = [];

        for (const userDoc of usersSnapshot.docs) {
            const userName = userDoc.id;
            const messagesSnapshot = await db.collection('locations').doc(chat).collection('users').doc(userName).collection('messages').orderBy('time').get();
            const userMessages = messagesSnapshot.docs.map(doc => {
                const data = doc.data();
                console.log('Retrieved message:', data); // Log the message data
                return {
                    message: data.message,
                    time: data.time,
                    date: data.date,
                    userName: userName
                };
            });
            messages = messages.concat(userMessages);
        }

        // Sort all messages by timestamp
        messages.sort((a, b) => a.time.toDate() - b.time.toDate());

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