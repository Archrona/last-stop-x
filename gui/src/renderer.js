
const MongoClient = require('mongodb').MongoClient;
const fs = require('fs');
const { genId } = require('../../src/gen_id');

const CONNECT_OPTIONS = {
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    useUnifiedTopology: true
};

class Renderer {
    constructor() {
        this.mySenderId = genId(8);
        console.log("GUI started");
        console.log("GUI Sender id: " + this.mySenderId);

        this.config = JSON.parse(fs.readFileSync("../config.json"));
        
        this.mongoUrl = `mongodb://localhost:${this.config.mongo.port}`;
        this.mongoClient = new MongoClient(this.mongoUrl, CONNECT_OPTIONS);

        this.db = null;

        this.mongoClient.connect((err) => {
            if (err === null) { 
                this.db = this.mongoClient.db("last-stop");

                this.db.collection("messages").insertOne({
                    time: new Date(),
                    sender: "elec",
                    sender_id: this.mySenderId,
                    message: "started"
                }).then(() => {
                    console.log("DB connection okay!");
                    this.onDBConnected();
                }).catch(() => {
                    console.error("Can't write message to DB");
                })
            } else {
                console.error("Can't connect to DB");
            }
        });
    }

    onDBConnected() {
        const st = this.db.collection("spoken_texts");

        const latest = st.find({ }).sort({ $natural: -1 }).limit(1);

        latest.next(async (err, doc) => {
            // Need to have a doc to get a tailable cursor,
            // so insert a dummy doc if nothing's found
            if (doc == undefined || doc == null) {
                await st.insertOne({
                    time: new Date(),
                    sender: "elec",
                    sender_id: this.mySenderId,
                    speech: ""
                });
            }

            this.spokenTextStream = st.find({ _id: { $gt: doc._id }}, {
                tailable: true,
                awaitData: true
            }).stream(); 

            this.spokenTextStream.on("data", (chunk) => this.onSpokenText(chunk));
        });
        
    }

    onSpokenText(chunk) {
        console.log(chunk);
    }
}

exports.Renderer = Renderer;