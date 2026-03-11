const productsEl = document.getElementById("products");

async function loadProducts() {
  const response = await fetch("/api/featured-products");
  const products = await response.json();

  productsEl.innerHTML = products
    .map(
      (product) => `
      <article class="card">
        <div class="emoji">${product.image}</div>
        <h3>${product.name}</h3>
        <p class="price">ETB ${product.price.toLocaleString()}</p>
        <p class="meta">${product.category} • ${product.city}</p>
        <p class="meta">Seller: ${product.seller}</p>
        <p class="meta">⭐ ${product.rating}</p>
      </article>
    `
    )
    .join("");
}

loadProducts();
