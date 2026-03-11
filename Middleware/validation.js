const sanitize = (str) => str ? str.toString().trim().replace(/[<>]/g, "") : "";
const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);
module.exports = { sanitize, validateEmail };
