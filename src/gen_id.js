
const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

exports.genId = (chars) => {
    let result = "";

    for (let i = 0; i < chars; i++) {
        result += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    
    return result;
}