const {onRequest} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const cors = require("cors")({
  origin: ["https://cantonarmy.com", "https://www.cantonarmy.com"]
});

admin.initializeApp();

const rateLimit = new Map();

exports.submitScore = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    const clientIP = req.ip;
    const now = Date.now();
    const rateLimitWindow = 60000;
    const maxRequests = 10;
    
    if (!rateLimit.has(clientIP)) {
      rateLimit.set(clientIP, []);
    }
    
    const requests = rateLimit.get(clientIP).filter(time => now - time < rateLimitWindow);
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({
        error: "Too many requests. Please wait before submitting again."
      });
    }
    
    requests.push(now);
    rateLimit.set(clientIP, requests);
    
    if (Math.random() < 0.01) {
      for (const [ip, times] of rateLimit.entries()) {
        const validTimes = times.filter(time => now - time < rateLimitWindow);
        if (validTimes.length === 0) {
          rateLimit.delete(ip);
        } else {
          rateLimit.set(ip, validTimes);
        }
      }
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

exports.weeklyLeaderboardCleanup = onSchedule(
  {
    schedule: "0 0 * * 1",
    timeZone: "UTC"
  },
  async (event) => {
    try {
      const db = admin.firestore();
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      const snapshot = await db.collection("leaderboard")
        .where("timestamp", "<", new Date(oneWeekAgo))
        .get();
      
      const batch = db.batch();
      let count = 0;
      
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
        count++;
      });
      
      await batch.commit();
      console.log(`Cleaned up ${count} old leaderboard entries`);
      
      return {success: true, deletedCount: count};
    } catch (error) {
      console.error("Weekly cleanup failed:", error);
      throw error;
    }
  }
);