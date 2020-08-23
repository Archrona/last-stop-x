using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.IO;
using System.Timers;

using MongoDB.Driver;
using MongoDB.Bson;
using Timer = System.Timers.Timer;

namespace SpeechConsole
{
    static class Program
    {
        static Config config = null;
        static MongoClient client = null;
        static IMongoDatabase db = null;
        static IMongoCollection<BsonDocument> spokenTexts = null;
        static IMongoCollection<BsonDocument> messages = null;
        static string mySenderId = null;
        static Timer commitSpeechTimer = null;
        
        static bool hasSpeechToSend = false;
        static string speech = "";
        static int speechAgeTicks = 0;
        const int SPEECH_SEND_AT_TICK = 3;

        static Random rng = new Random();

        static string ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

        static string genId(int length) {
            string result = "";
            for (int i = 0; i < length; i++) {
                result += ID_CHARS[rng.Next(0, ID_CHARS.Length)];
            }
            return result;
        }

        static void initConfig() {
            try {
                string configJson = File.ReadAllText("../config.json");
                config = JsonConvert.DeserializeObject<Config>(configJson);
                Console.WriteLine("Read config.");
            } catch (Exception e) {
                Console.Error.WriteLine("Error has occurred reading config");
                Console.Error.WriteLine(e.Message);
                Environment.Exit(1);
            }
        }

        static void initDatabase() {
            try {
                mySenderId = genId(8);

                var settings = new MongoClientSettings {
                    Server = new MongoServerAddress("localhost", config.mongo.port),
                    ConnectTimeout = new TimeSpan(0, 0, 5)
                };

                client = new MongoClient(settings);
                db = client.GetDatabase("last-stop");
                spokenTexts = db.GetCollection<BsonDocument>("spoken_texts");
                messages = db.GetCollection<BsonDocument>("messages");

                Console.WriteLine("Trying to connect to db...");

                messages.InsertOne(new BsonDocument {
                    { "time", DateTime.UtcNow },
                    { "sender", "speech_console" },
                    { "sender_id", mySenderId },
                    { "message", "started" }
                });

                Console.WriteLine("Connected to db.");
            } catch (Exception e) {
                Console.Error.WriteLine("Error has occurred connecting to DB");
                Console.Error.WriteLine(e.Message);
                Environment.Exit(1);
            }
        }

        static void initTimer() {
            commitSpeechTimer = new Timer(20);
            commitSpeechTimer.Elapsed += OnCommitSpeechTick;
            commitSpeechTimer.AutoReset = true;
            commitSpeechTimer.Enabled = true;
        }

        private static void OnCommitSpeechTick(object sender, EventArgs e) {
            if (hasSpeechToSend) {
                speechAgeTicks += 1;
                if (speechAgeTicks >= SPEECH_SEND_AT_TICK) {
                    hasSpeechToSend = false;
                    speechAgeTicks = 0;

                    spokenTexts.InsertOne(new BsonDocument {
                        { "time", DateTime.UtcNow },
                        { "sender", "speech_console" },
                        { "sender_id", mySenderId },
                        { "speech", speech }
                    });

/*                  spokenTexts.InsertOneAsync(new BsonDocument {
                        { "time", DateTime.UtcNow },
                        { "sender", "speech_console" },
                        { "sender_id", mySenderId },
                        { "speech", speech }
                    }).ContinueWith((Task t) => {
                        if (t.IsFaulted) {
                            Console.Error.WriteLine("Could not write spoken text to DB!");
                        }
                    });
*/
                }
            }
        }

        public static void onSpeechChanged(string text) {
            speech = text;
            speechAgeTicks = 0;
            hasSpeechToSend = true;
        }

        private static void Application_ApplicationExit(object sender, EventArgs e) {
            if (client != null) {
                messages.InsertOne(new BsonDocument {
                    { "time", DateTime.UtcNow },
                    { "sender", "speech_console" },
                    { "sender_id", mySenderId },
                    { "message", "exited" }
                });
            }

            Console.WriteLine("Speech console closing");
        }



        [STAThread]
        static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            initConfig();
            initDatabase();
            initTimer();

            Application.ApplicationExit += Application_ApplicationExit;

            Application.Run(new Window());
        }
    }
}
