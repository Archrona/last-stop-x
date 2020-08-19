# last-stop-x

## Design

Concurrency issues and bugs plagued the previous version, largely due to architectural
decisions. I'd like a chance to fix that.

Here's what's different:

- Using MongoDB as a backing store and for pub/sub messaging

- Only allowing *one* process to be actively editing
  - So either speech console or one of the windows

- Contexts are not deduced from the file, but from user input (for now)
  - A document consists of a binary blob of UTF-8 - that's it. Not even lines.
  - Updates are performed at the document level of granularity
  - There is a certain context "at the cursor"
  - As long as the cursor does not leave the area of active speech entry, context can be remembered by
    the speech subsystem

- Context deduction is really a parsing problem. 
  - Use external parsers and tools to deliver on asynchronous, native-quality parsing
    and syntax highlighting
  - Extract symbols, determine context regions, etc. by spawning process

- Speech commands are broken down into two categories.

  - (1) Code entry
    - Strings of these commands simply process to text output.
    - Casing, picking, spacing, alpha, identifiers, local structural, step/jump/etc.
    - Context can be pushed/popped within a single region of code entry
    - When a string of code entry commands terminates, the resulting code must be
      stitched into the target document at the cursor position
      - BUT code entry commands can be processed without reference to immediate surroundings
    - During a string of code entry commands, short names, IDs, and so on are never updated
      - Names and config are guaranteed constant between commit times
    - Strings of code entry do not modify document but intermediate result is optionally
      shown by active code windows (placed into DB, up to them whether they want to show)
    - Think: What could QEdit do?

  - (2) Immediate commit
    - These commands have side-effects or are global and commit immediately upon execution
    - cut/copy/paste from clipboard, load/save, refresh files, switch editor modes
    - Local and global navigation, focus change, configuration, changing context at cursor
    - Multiple immediate commit commands can be used in a row but no changes will be
      visible to any state or UI until the commit is processed
    - Commit is requested with the special word "please" or with special keypress
      - Ex. You can say "yank that go 31" and nothing will happen until you say "please".
        Then the entire string will get processed in one slurp

- Only document text can be undone.
  - Every text of a document ever committed has a unique ID
  - Store a list of all document versions from front to back
  - Periodically clean up really old ones when size is getting too big
  - Refuse to allow undos for really, REALLY big files

- Direct input into windows
  - Contents of document are mirrored in local window process, editing occurs there
  - Commit sends doc back to DB and makes new unique id

- Project management
  - Separate process reconciles in-memory with on-disk

- View and rendering are done in the electron client.
  - No more subscription rendering on the server!
  - State for cursor position, etc. is stored in the gui client
    - Spoken commands for cursor navigation are more like *requests* that windows can honor
    - They're immediate commit now, for obvious reasons...

- Use off-the-shelf components in the client to do direct editing?
  - CodeMirror or Ace
  - During speech, might need more stringent control (token numbering, contexts...)
- OR, for consistency, build it ourselves
  - make sure to handle long lines well, though

- 

## DB Design

- buffers  (immutable)
  - Collection of immutable text buffers, each with unique ID
  - Buffers are images of a document at a particular moment in time
  - Can be diffs against another buffer (use jsdiff)?

- enrichments  (immutable)
  - Collection of enrichments corresponding to buffers
  - Enrichments contain syntax highlighting, symbols, and other pertinent info
    generated from a full parse of the file
  - Enrichments are *optional*. Large files will not be enriched.

- documents  (mutable)
  - Collection of docs, each with unique ID (*not* the filename)
  - Contains:
    - metadata
    - current buffer
    - list of undo buffers in chronological order
  - May correspond to a file on disk, or not.
    - Filename may change if file is moved
    - File backing doc may be deleted
    - New file might not be saved yet
    - ... you get the idea
  - If they DO correspond to a file on disk, the project-relative path is stored here

- participants  (mutable)
  - Low TTL DB for heartbeats so clients can get to know each other
  - participants choose a unique ID for themselves and this can target messages

- messages  (mutable)
  - A ring of messages (capped collection) with incrementing message ID
  - Participants can tail the collection or do .find({id: {$gt: last value}}) to get
    newest messages
  - Messages serve as notifications to synchronize interprocess communication
    - When a buffer is enriched
    - When a commit is made to a document
    - When a new participant shows up or an old one leaves
    - When project metadata changes
  - Processes can also just watch the entire db
    - ... but I'm concerned it might be a bit slow

- project  (mutable)
  - There is but one project
  - All global configuration goes here
    - base directory
    - unique ID counters
  