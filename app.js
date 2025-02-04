
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const path = require("path");

// Initialize app and server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

// Connect MongoDB
mongoose.connect("mongodb://localhost:27017/threatDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// Define Threat model
const threatSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  severity: String,
  ipAddress: String,
  threatType: String,
});
const Threat = mongoose.model("Threat", threatSchema);

// API Endpoints

// GET: Fetch all threats
app.get("/api/threats", async (req, res) => {
  const threats = await Threat.find().sort({ timestamp: -1 });
  res.json(threats);
});

// POST: Add new threat
app.post("/api/threats", async (req, res) => {
  const { severity, ipAddress, threatType } = req.body;
  const newThreat = new Threat({ severity, ipAddress, threatType });
  await newThreat.save();
  io.emit("newThreat", newThreat); // Notify all clients in real-time
  res.json(newThreat);
});

// PUT: Update an existing threat
app.put("/api/threats/:id", async (req, res) => {
  const { id } = req.params;
  const { severity, ipAddress, threatType } = req.body;

  try {
    const updatedThreat = await Threat.findByIdAndUpdate(
      id,
      { severity, ipAddress, threatType },
      { new: true } // Returns the updated document
    );
    if (!updatedThreat) {
      return res.status(404).json({ message: "Threat not found" });
    }
    io.emit("updateThreat", updatedThreat); // Notify all clients about the updated threat
    res.json(updatedThreat);
  } catch (error) {
    res.status(500).json({ message: "Error updating threat", error });
  }
});

// DELETE: Delete a threat
app.delete("/api/threats/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedThreat = await Threat.findByIdAndDelete(id);
    if (!deletedThreat) {
      return res.status(404).json({ message: "Threat not found" });
    }
    io.emit("deleteThreat", id); // Notify all clients that a threat has been deleted
    res.json({ message: "Threat deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting threat", error });
  }
});

// Serve Frontend
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Socket.io for Real-Time Communication
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("disconnect", () => console.log("Client disconnected"));
});

// Start Server
const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Frontend Code (React.js)
// Note: This part remains unchanged as provided in the previous example
const frontend = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Threat Dashboard</title>
  <script src="https://cdn.socket.io/4.0.0/socket.io.min.js"></script>
  <script crossorigin src="https://unpkg.com/react@17/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@17/umd/react-dom.development.js"></script>
  <script crossorigin src="https://unpkg.com/axios/dist/axios.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    const { useState, useEffect } = React;

    const ThreatDashboard = () => {
      const [threats, setThreats] = useState([]);
      const socket = io("http://localhost:5000");

      useEffect(() => {
        axios.get("/api/threats").then((res) => setThreats(res.data));
        socket.on("newThreat", (newThreat) => setThreats((prev) => [newThreat, ...prev]));
        socket.on("updateThreat", (updatedThreat) => {
          setThreats((prev) => prev.map(t => t._id === updatedThreat._id ? updatedThreat : t));
        });
        socket.on("deleteThreat", (id) => {
          setThreats((prev) => prev.filter(t => t._id !== id));
        });
        return () => {
          socket.off("newThreat");
          socket.off("updateThreat");
          socket.off("deleteThreat");
        };
      }, []);

      const addThreat = () => {
        const newThreat = {
          severity: "High",
          ipAddress: "192.168.1.100",
          threatType: "DDoS Attack",
        };
        axios.post("/api/threats", newThreat);
      };

      return (
        React.createElement("div", null,
          React.createElement("h1", null, "Real-Time Threat Dashboard"),
          React.createElement("button", { onClick: addThreat }, "Simulate Threat"),
          React.createElement("ul", null, threats.map((t) =>
            React.createElement("li", { key: t._id },
              t.timestamp, " | ", t.severity, " | ", t.ipAddress, " | ", t.threatType,
              React.createElement("button", { onClick: () => updateThreat(t._id) }, "Update"),
              React.createElement("button", { onClick: () => deleteThreat(t._id) }, "Delete")
            )
          ))
        )
      );
    };

    ReactDOM.render(
      React.createElement(ThreatDashboard),
      document.getElementById("root")
    );
  </script>
</body>
</html>
`;

// Write Frontend Code to Disk
const fs = require("fs");
const frontendPath = path.join(__dirname, "frontend");
if (!fs.existsSync(frontendPath)) fs.mkdirSync(frontendPath);
fs.writeFileSync(path.join(frontendPath, "index.html"), frontend);
