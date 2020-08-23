const { spawn, exec } = require('child_process');
const fs = require('fs');
const { SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION } = require('constants');
const { pathToFileURL } = require('url');
const MongoClient = require('mongodb').MongoClient;
const path = require('path');
const tree_kill = require('tree-kill');
const { genId } = require('../gen_id');

const CONNECT_OPTIONS = {
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    useUnifiedTopology: true
};

class App {
    constructor() {
        this.log("app", false, "Welcome to Last Stop X!");

        this.mySenderId = genId(8);
        this.log("app", false, "Sender ID: " + this.mySenderId);

        this.registerProcessHooks();

        this.config = JSON.parse(fs.readFileSync("config.json"));

        this.stage1_dbConnect();
    }

    registerProcessHooks() {
        process.on('exit', (code) => {
            this.log("app", false, `Exiting with code ${code}`);
        });

        process.on("SIGINT", () => {
            this.log("app", false, "received SIGINT");
            this.sigint();
        });
    }

    stage1_dbConnect() {
        this.openMongo();

        this.mongoUrl = `mongodb://localhost:${this.config.mongo.port}`;
        this.mongoClient = new MongoClient(this.mongoUrl, CONNECT_OPTIONS);

        this.mongoClient.connect((err) => {
            if (err === null) { 
                this.mongoClient.db("last-stop").collection("messages").insertOne({
                    time: new Date(),
                    sender: "main",
                    sender_id: this.mySenderId,
                    message: "started"
                }).then(() => {
                    this.log("mongod", false, "DB is up!");
                    this.stage2();
                }).catch(() => {
                    this.log("mongod", true, "Could not write message to DB");
                    this.sigint();
                })
            } else {
                this.log("mongod", true, "DB is down");
                this.sigint();
            }
        });
    }

    stage2() {
        this.openGui();
        this.openSpeechConsole();
        this.stage3();
    }

    stage3() {
        this.log("app", false, "Sleeping. Ctrl-C to end everything!");
        setTimeout(() => this.sleepCycle(), 1000);
    }

    log(from, isError, str) {
        console.log(
            (isError ? "*** " : "    ")
            + (" ".repeat(6 - from.length))
            + from
            + ": "
            + str
        );
    }

    sleepCycle() {
        //this.log("app", false, "heartbeat. mongod is pid " + this.mongod.pid);
        setTimeout(() => this.sleepCycle(), 1000);
    }

    sigint() {
        Promise.all([
            this.closeMongo(),
            this.closeGui(),
            this.closeSpeechConsole()
        ]).then((values) => {
            process.exit();
        }).catch((reason) => {
            this.log("app", true, "Error on safe close: " + reason);
            process.exit();
        });
    }

    closeMongo() {
        return new Promise((resolve, reject) => {
            const url = `mongodb://localhost:${this.config.mongo.port}`;
            const dbName = "admin";
            const client = new MongoClient(url, CONNECT_OPTIONS);
            client.connect((err) => {
                if (err === null) { 
                    this.log("mongod", false, "Shutting down mongod.");

                    const db = client.db("admin");

                    db.executeDbAdminCommand({
                        shutdown: 1,
                        force: false,
                        timeoutSecs: 10
                    }).then((result) => {
                        this.log("mongod", false, "Mongod shut down successfully.");
                        resolve();
                    }).catch((err) => {
                        this.log("mongod", false, "Mongod shutdown issued. Killing in 3 sec.");
                        setTimeout(() => {
                            if (this.mongod.exitCode === null) {
                                this.log("mongod", false, "Issuing kill -2 to stubborn mongod");
                                this.mongod.kill(2);
                                resolve();
                            } else {
                                this.log("mongod", false, 
                                    "Mongod happily shut down with exit code " + this.mongod.exitCode);
                                resolve();
                            }
                        }, 3000);
                    });

                } else {
                    this.log("mongod", true, "Tried to gracefully close mongod but no conn possible.");
                    this.log("mongod", false, "Issuing kill -2 to mongod");
                    this.mongod.kill(2);
                    resolve();
                }
            });
        });
    }

    closeGui() {
        return new Promise((resolve, reject) => {
            if (this.gui !== undefined) {
                this.log("elec", false, "Killing gui...");
                tree_kill(this.gui.pid, 'SIGTERM', (err) => {
                    this.log("elec", false, "Killed. (err " + err + ")");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    closeSpeechConsole() {
        return new Promise((resolve, reject) => {
            if (this.speechConsole !== undefined) {
                this.log("sc", false, "Killing speech console...");
                tree_kill(this.speechConsole.pid, 'SIGTERM', (err) => {
                    this.log("sc", false, "Killed. (err " + err + ")");
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    openMongo() {
        this.log("mongod", false, `Spawning mongod on port ${this.config.mongo.port}...`);

        this.mongod = spawn(
            this.config.mongo.bin,
            [
                '--config',
                'mongod.yaml',
                '--port',
                this.config.mongo.port,
                '--bind_ip',
                this.config.mongo.bind
            ],
            {
                detached: true,
                cwd: process.cwd()
            }
        );

        this.mongod.stdout.on('data', (data) => {
            this.log("mongod", false, data);
        });

        this.mongod.stderr.on('data', (data) => {
            this.log("mongod", true, data);
        });

        this.mongod.on("close", (code, signal) => {
            this.log("mongod", (code > 0), "mongod exited with code " + code + ", sig " + signal);
        });
    }

    openGui() {
        this.log("elec", false, `Spawning gui...`);

        this.gui = exec(
            this.config.gui.exec,
            {
                detached: false,
                cwd: path.resolve(process.cwd(), this.config.gui.cwd)
            }
        );

        this.gui.stdout.on('data', (data) => {
            this.log("elec", false, data.replace(/(?:^\s+)|(?:\s+$)|\r|\n/, ""));
        });

        this.gui.stderr.on('data', (data) => {
            this.log("elec", true, data.replace(/(?:^\s+)|(?:\s+$)|\r|\n/, ""));
        });

        this.gui.on("close", (code, signal) => {
            this.log("elec", (code > 0), "gui exited with code " + code + ", sig " + signal);
            delete this.gui;
        });
    }

    openSpeechConsole() {
        this.log("sc", false, `Spawning speech console...`);

        this.speechConsole = exec(
            this.config.speech_console.bin,
            {
                detached: false,
                cwd: path.resolve(process.cwd(), this.config.speech_console.cwd)
            }
        );

        this.speechConsole.stdout.on('data', (data) => {
            this.log("sc", false, data.replace(/(?:^\s+)|(?:\s+$)|\r|\n/, ""));
        });

        this.speechConsole.stderr.on('data', (data) => {
            this.log("sc", true, data.replace(/(?:^\s+)|(?:\s+$)|\r|\n/, ""));
        });

        this.speechConsole.on("close", (code, signal) => {
            this.log("sc", (code > 0), "speech console exited with code " + code + ", sig " + signal);
            delete this.speechConsole;
        });
    }
}

exports.App = App;