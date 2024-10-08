import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5dbzkti.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const accesTokenSecret = process.env.TOKEN_SECRET as string;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyUser = (req: Request, res: Response, next: NextFunction): void => {
  const accessToken = req.headers.accesstoken as string;
  // console.log(req.headers);
  // console.log(accessToken);

  if (!accessToken) {
    res.status(401).send({ message: "Unauthorized access" });
    return;
  }

  jwt.verify(accessToken, accesTokenSecret, (err, decoded) => {
    if (err) {
      res.status(403).send({ message: "Something went wrong" });
      return;
    }
    next();
  });
};

const verifyTutor = (req: Request, res: Response, next: NextFunction): void => {
  const accessToken = req.headers.accesstoken as string;

  if (!accessToken) {
    res.status(401).send({ message: "Unauthorized access" });
    return;
  }

  jwt.verify(accessToken, accesTokenSecret, (err, decoded) => {
    if (err) {
      res.status(403).send({ message: "Something went wrong" });
      return;
    }
    if (typeof decoded != "string" && typeof decoded != "undefined") {
      if (decoded.role !== "tutor")
        res.status(403).send({ message: "Forbidden access" });
    }
    next();
  });
};

const verifyAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const accessToken = req.headers.accesstoken as string;
  jwt.verify(accessToken, accesTokenSecret, (err, decoded) => {
    if (err) {
      res.status(400).send({ message: "Bad request" });
      return;
    }
    if (typeof decoded != "string" && typeof decoded != "undefined") {
      if (decoded.role !== "admin") {
        res.status(403).send({ message: "Forbidden access" });
        return;
      }

      next();
    }
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    const users = client.db("tsc").collection("users");
    const studySession = client.db("tsc").collection("studySession");
    const sessionMaterials = client.db("tsc").collection("sessionMaterials");
    const bookedSessions = client.db("tsc").collection("bookedSessions");
    const notes = client.db("tsc").collection("notes");
    const ratings = client.db("tsc").collection("ratings");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, accesTokenSecret);
      res.send({ token });
    });

    //user related apis
    app.get("/user/:email", async (req, res) => {
      const query = { email: req.params.email };
      const user = await users.findOne(query);
      res.send(user);
    });

    app.get("/users", async (req, res) => {
      const search = req.query.search as string;
      const role = req.query.role as string;

      if (!search && !role) {
        const data = await users.find().toArray();
        return res.send(data);
      }

      // search for a specific user with name or email
      if (search) {
        const query = {
          $or: [
            { email: { $regex: search, $options: "i" } },
            { displayName: { $regex: search, $options: "i" } },
          ],
        };

        const result = await users.find(query).toArray();
        return res.send(result);
      }

      // get a user with role specified in the query.
      if (role) {
        const tutors = await users.find({ role: role }).toArray();
        res.send(tutors);
      }
    });

    app.post("/users", async (req, res) => {
      const isSocialLogin = req.query.socialLogin == "true";
      const defaultUser = req.body;
      const socialUser = { ...req.body, role: "student" };
      const socialUserEmail = socialUser.email;
      const isOldUser = await users.findOne({ email: socialUserEmail });

      if (isOldUser) {
        return res.send({ message: "User already registered" });
      } else {
        if (!isSocialLogin) {
          const result = await users.insertOne(defaultUser);
          res.send(result);
        } else {
          const result = await users.insertOne(socialUser);
          res.send(result);
        }
      }
    });

    app.patch("/user/:id", verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const updatedDoc = req.body;
      const result = await users.updateOne(query, { $set: updatedDoc });
      res.send(result);
    });

    // study session related apis
    app.get("/study-session", async (req, res) => {
      const email = req.query.email;
      const status = req.query.status;

      const pipeline = [
        {
          $match: email ? { tutorEmail: email } : {},
        },
        ...(status ? [{ $match: { status: status } }] : []),
        {
          $addFields: {
            statusOrder: {
              $cond: [
                { $eq: ["$status", "approved"] },
                1,
                { $cond: [{ $eq: ["$status", "rejected"] }, 2, 3] },
              ],
            },
          },
        },
        {
          $sort: { statusOrder: 1 },
        },
        {
          $project: { statusOrder: 0 }, // Optional: Exclude the statusOrder field from the result
        },
      ];

      const result = await studySession.aggregate(pipeline).toArray();
      res.send(result);
    });

    app.get("/study-session/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await studySession.findOne(query);
      res.send(result);
    });

    app.patch("/study-session/:id", verifyUser, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const updateData = req.body;
      const result = await studySession.updateOne(query, {
        $set: updateData,
      });
      res.send(result);
    });

    app.post("/study-session", verifyUser, verifyTutor, async (req, res) => {
      const session = req.body;
      const result = await studySession.insertOne(session);
      res.send(result);
    });

    app.delete("/study-session/:id", verifyAdmin, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await studySession.deleteOne(query);
      res.send(result);
    });

    // booked session related apis
    app.get("/booked-sessions/:email", async (req, res) => {
      const result = await bookedSessions
        .find({
          studentEmail: req.params.email,
        })
        .toArray();
      res.send(result);
    });

    app.get("/booked-sessions", async (req, res) => {
      const query = { _id: new ObjectId(req.query.id as string) };
      const result = await bookedSessions.findOne(query);
      res.send(result);
    });

    app.post("/booked-sessions", async (req, res) => {
      const existingSession = await bookedSessions.findOne({
        studentEmail: req.body.studentEmail,
        sessionId: req.body.sessionId,
      });
      if (existingSession) {
        return res
          .status(409)
          .send({ message: "Already booked for this session" });
      }
      const data = req.body;
      const result = await bookedSessions.insertOne(data);
      res.send(result);
    });

    //session materials related apis
    app.get("/session-materials", verifyUser, async (req, res) => {
      const email = req.query?.email;
      const query = { tutorEmail: email };
      const result = await sessionMaterials.find(email ? query : {}).toArray();
      res.send(result);
    });

    app.get("/view-materials", async (req, res) => {
      const query = { sessionId: req.query.sessionId };
      const result = await sessionMaterials.find(query).toArray();
      res.send(result);
    });

    app.get("/session-materials/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await sessionMaterials.findOne(query);
      res.send(result);
    });

    app.post(
      "/session-materials",
      verifyUser,
      verifyTutor,
      async (req, res) => {
        const data = req.body;
        const result = await sessionMaterials.insertOne(data);
        res.send(result);
      }
    );

    app.patch(
      "/session-materials/:id",
      verifyUser,
      verifyTutor,
      async (req, res) => {
        const query = { _id: new ObjectId(req.params.id) };
        const result = await sessionMaterials.updateOne(query, {
          $set: req.body,
        });
        res.send(result);
      }
    );

    app.delete("/session-materials/:id", verifyUser, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await sessionMaterials.deleteOne(query);
      res.send(result);
    });

    // notes relate apis
    app.get("/notes/:email", verifyUser, async (req, res) => {
      const query = { email: req.params.email };
      const userNotes = await notes.find(query).toArray();
      res.send(userNotes);
    });

    app.delete("/notes/:id", verifyUser, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await notes.deleteOne(query);
      res.send(result);
    });

    app.patch("/notes/:id", verifyUser, async (req, res) => {
      const filter = { _id: new ObjectId(req.params.id) };
      const updateDoc = req.body;
      const result = await notes.updateOne(filter, { $set: updateDoc });
      res.send(result);
    });

    app.post("/create-note", verifyUser, async (req, res) => {
      const note = req.body;
      const result = await notes.insertOne(note);
      res.send(result);
    });

    // ratings related api
    app.get("/ratings/:id", async (req, res) => {
      const query = { sessionId: req.params.id };
      const result = await ratings.find(query).toArray();
      res.send(result);
    });

    app.post("/ratings", verifyUser, async (req, res) => {
      const result = await ratings.insertOne(req.body);
      res.send(result);
    });

    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});

app.get("/", (req, res) => {
  res.send("Tsc server is running");
  // res.send(req.params);
});

app.get("/test", (req, res) => {
  res.send(req.query);
});
