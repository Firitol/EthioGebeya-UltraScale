const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

const featuredProducts = [
  {
    id: 1,
    name: "Sidama Coffee Beans",
    price: 480,
    category: "Grocery",
    seller: "Alemu Traders",
    city: "Addis Ababa",
    rating: 4.8,
    image: "☕"
  },
  {
    id: 2,
    name: "Habesha Kemis",
    price: 3500,
    category: "Fashion",
    seller: "Tigist Boutique",
    city: "Bahir Dar",
    rating: 4.6,
    image: "👗"
  },
  {
    id: 3,
    name: "Handwoven Mesob",
    price: 1200,
    category: "Home",
    seller: "Gondar Crafts",
    city: "Gondar",
    rating: 4.7,
    image: "🧺"
  },
  {
    id: 4,
    name: "Injera Mitad (Electric)",
    price: 6200,
    category: "Appliances",
    seller: "Sheba Electronics",
    city: "Hawassa",
    rating: 4.5,
    image: "🍳"
  }
];

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json"
};

const server = http.createServer((req, res) => {
  if (req.url === "/api/featured-products") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(featuredProducts));
    return;
  }

  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^\.+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`EthioGebeya running at http://localhost:${PORT}`);
});
