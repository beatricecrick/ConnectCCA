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
    const { locationName, members, owner } = req.body;
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

        // Automatically add the owner to the location
        const ownerChatRef = db.collection('users').doc(owner).collection('chats').doc(locationName);
        await ownerChatRef.set({
            locationName: locationName,
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });

        const locationOwnerRef = db.collection('locations').doc(locationName).collection('users').doc(owner);
        await locationOwnerRef.set({
            info: '',
            settings: {},
        });

        // Send notifications to users instead of automatically adding them
        const batch = db.batch();
        members.forEach(member => {
            if (member !== owner) {
                const notificationRef = db.collection('users').doc(member).collection('notifications').doc(locationName);
                batch.set(notificationRef, {
                    locationName: locationName,
                    time: new Date(),
                    date: new Date().toLocaleDateString(),
                    status: 'pending'
                });
                console.log("Notification sent to user:", member);
            }
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

// Get notifications for a user
app.get('/getNotifications', async (req, res) => {
    const { userName } = req.query;
    console.log("Received request to get notifications for user:", userName);
    try {
        const notificationsSnapshot = await db.collection('users').doc(userName).collection('notifications').get();
        const notifications = notificationsSnapshot.docs.map(doc => doc.data());
        res.json(notifications);
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Accept invite
app.post('/acceptInvite', async (req, res) => {
    const { userName, locationName } = req.body;
    console.log("Received request to accept invite:", req.body);
    if (!locationName) {
        return res.status(400).json({ error: 'Location name is required' });
    }
    try {
        const userChatRef = db.collection('users').doc(userName).collection('chats').doc(locationName);
        await userChatRef.set({
            locationName: locationName,
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });

        const locationUserRef = db.collection('locations').doc(locationName).collection('users').doc(userName);
        await locationUserRef.set({
            info: '',
            settings: {},
        });

        // Remove the notification
        const notificationRef = db.collection('users').doc(userName).collection('notifications').doc(locationName);
        await notificationRef.delete();

        res.json({ success: true });
    } catch (error) {
        console.error('Error accepting invite:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Deny invite
app.post('/denyInvite', async (req, res) => {
    const { userName, locationName } = req.body;
    console.log("Received request to deny invite:", req.body);
    if (!locationName) {
        return res.status(400).json({ error: 'Location name is required' });
    }
    try {
        // Remove the notification
        const notificationRef = db.collection('users').doc(userName).collection('notifications').doc(locationName);
        await notificationRef.delete();

        res.json({ success: true });
    } catch (error) {
        console.error('Error denying invite:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Add friend request
app.post('/addFriend', async (req, res) => {
    const { userName, friendName } = req.body;
    console.log("Received request to add friend:", req.body);
    try {
        let notificationId = `friend:${userName}`;
        let i = 1;
        let notificationRef = db.collection('users').doc(friendName).collection('notifications').doc(notificationId);
        let doc = await notificationRef.get();
        while (doc.exists) {
            notificationId = `friend:${userName}+${i}`;
            notificationRef = db.collection('users').doc(friendName).collection('notifications').doc(notificationId);
            doc = await notificationRef.get();
            i++;
        }
        await notificationRef.set({
            type: 'friend_request',
            from: userName,
            time: new Date(),
            date: new Date().toLocaleDateString(),
            status: 'pending'
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Error adding friend:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Accept friend request
app.post('/acceptFriendRequest', async (req, res) => {
    const { userName, friendName } = req.body;
    console.log("Received request to accept friend request:", req.body);
    if (!friendName) {
        return res.status(400).json({ error: 'Friend name is required' });
    }
    try {
        const userFriendRef = db.collection('users').doc(userName).collection('friends').doc(friendName);
        await userFriendRef.set({
            name: friendName,
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });

        const friendUserRef = db.collection('users').doc(friendName).collection('friends').doc(userName);
        await friendUserRef.set({
            name: userName,
            time: new Date(),
            date: new Date().toLocaleDateString(),
        });

        // Remove the notification
        const notificationRef = db.collection('users').doc(userName).collection('notifications').doc(`friend:${friendName}`);
        await notificationRef.delete();

        res.json({ success: true });
    } catch (error) {
        console.error('Error accepting friend request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Deny friend request
app.post('/denyFriendRequest', async (req, res) => {
    const { userName, friendName } = req.body;
    console.log("Received request to deny friend request:", req.body);
    if (!friendName) {
        return res.status(400).json({ error: 'Friend name is required' });
    }
    try {
        // Remove the notification
        const notificationRef = db.collection('users').doc(userName).collection('notifications').doc(`friend:${friendName}`);
        await notificationRef.delete();

        res.json({ success: true });
    } catch (error) {
        console.error('Error denying friend request:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get friends for a user
app.get('/getFriends', async (req, res) => {
    const { userName } = req.query;
    console.log("Received request to get friends for user:", userName);
    try {
        const friendsSnapshot = await db.collection('users').doc(userName).collection('friends').get();
        const friends = friendsSnapshot.docs.map(doc => doc.id);
        res.json(friends);
        console.log("Friends:", friends);
    } catch (error) {
        console.error('Error getting friends:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = app;//for vercel
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});