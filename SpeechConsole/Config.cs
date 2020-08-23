using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SpeechConsole
{
    public class MongoConfig
    {
        public string bin;
        public int port;
        public string bind;
        public string config;
    }

    public class GuiConfig
    {
        public string exec;
        public string cwd;
    }

    public class Config
    {
        public MongoConfig mongo;
        public GuiConfig gui;
    }
}
