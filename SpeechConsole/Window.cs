using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Drawing;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;


namespace SpeechConsole
{
    public partial class Window : Form
    {
        public Window() {
            InitializeComponent();
        }

        private void input_TextChanged(object sender, EventArgs e) {
            Program.onSpeechChanged(input.Text);
        }

        private void Window_Load(object sender, EventArgs e) {

        }

        private void Window_KeyDown(object sender, KeyEventArgs e) {
            
        }

        private void textChangeMonitor_Tick(object sender, EventArgs e) {
            
        }

        private void Window_FormClosing(object sender, FormClosingEventArgs e) {

        }
    }
}
