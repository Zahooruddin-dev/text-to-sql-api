module.exports = (req, res, next) => {
    const userKey = req.header('x-api-key');
    if (userKey !== process.env.MY_APP_PASSWORD) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }
    next();
};