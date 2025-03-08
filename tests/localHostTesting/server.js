// const express = require('express');
// const http = require('http');
// const socketIo = require('socket.io');
// const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
// const { getFirestore } = require('firebase-admin/firestore');

// // Initialize Firebase
// initializeApp({
//     credential: applicationDefault(), // Or use a service account key
// });

// const db = getFirestore();

// const app = express();
// const server = http.createServer(app);
// const io = socketIo(server);

// let users = {}; // Track connected users

// // Handle real-time chat
// io.on('connection', (socket) => {
//     console.log('A user connected:', socket.id);
    
//     // Store the user's ID and class info
//     socket.on('join', (classInfo) => {
//         users[socket.id] = classInfo;
//         console.log(`${socket.id} joined class ${classInfo}`);
//     });

//     // Broadcast messages to other users in the same class
//     socket.on('chat message', (msg, classInfo) => {
//         io.emit('chat message', { msg, classInfo });
//         saveMessageToFirestore(msg, classInfo); // Store message in Firestore
//     });

//     socket.on('disconnect', () => {
//         console.log('User disconnected');
//         delete users[socket.id];
//     });
// });

// // Save message to Firebase Firestore
// async function saveMessageToFirestore(msg, classInfo) {
//     await db.collection('messages').add({
//         message: msg,
//         class: classInfo,
//         timestamp: new Date(),
//     });
// }

// server.listen(3000, () => {
//     console.log('Server is running on http://localhost:3000');
// });


const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("chat message", (msg, classInfo) => {
        io.emit("chat message", { msg: msg, class: classInfo }); // Send an object with both values
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
//test