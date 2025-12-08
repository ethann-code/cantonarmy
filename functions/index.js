const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

admin.initializeApp();

// Submit score endpoint
exports.submitScore = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    try {
      const {playerName, score, level, timestamp} = req.body;

      if (!playerName || score === undefined || !level) {
        return res.status(400).json({error: "Missing required fields"});
      }

      if (score < 0 || score > 1000000) {
        return res.status(400).json({error: "Invalid score"});
      }

      const sanitizedName = playerName.trim().substring(0, 20);

      const db = admin.firestore();
      const scoreData = {
        playerName: sanitizedName,
        score: parseInt(score),
        level: parseInt(level),
        timestamp: timestamp || admin.firestore.FieldValue.serverTimestamp(),
        ip: req.ip,
      };

      await db.collection("leaderboard").add(scoreData);

      return res.status(200).json({
        success: true,
        message: "Score submitted successfully",
      });
    } catch (error) {
      console.error("Error submitting score:", error);
      return res.status(500).json({error: "Internal server error"});
    }
  });
});

// Get leaderboard endpoint
exports.getLeaderboard = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const db = admin.firestore();
      const snapshot = await db.collection("leaderboard")
          .orderBy("score", "desc")
          .limit(limit)
          .get();

      const leaderboard = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        leaderboard.push({
          playerName: data.playerName,
          score: data.score,
          level: data.level,
          timestamp: data.timestamp,
        });
      });

      return res.status(200).json({
        success: true,
        leaderboard: leaderboard,
      });
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      return res.status(500).json({error: "Internal server error"});
    }
  });
});