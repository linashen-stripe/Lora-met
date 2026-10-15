import type React from 'react';

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  consumptionData?: ConsumptionData;
  creditSource?: 'trial' | 'plan';
}

export interface AppState {
  html: string;
  css: string;
  js: string;
}

export interface ImageUsage {
  type: 'basic' | 'standard' | 'premium';
  count: number;
  operation: 'generated' | 'enhanced' | 'batch_generated';
}

export interface ConsumptionData {
  modelType: 'mini' | 'standard' | 'large';
  inputTokens: number;
  outputTokens: number;
  images: ImageUsage[];
  creditsCost: number;
}

export interface ChatState {
  messages: Message[];
  currentStep: number;
  appState: AppState;
}

export const CHAT_STATE_KEY = 'savory-seasons-chat-state-new';

// Function to get translated prompts - these keys will be translated
export const getRestaurantPrompts = (t: (key: string) => string): string[] => [
  t('chat.prompts.step1'),
  t('chat.prompts.step2'),
  t('chat.prompts.step3'),
  t('chat.prompts.step4'),
  t('chat.prompts.step5'),
  t('chat.prompts.step6'),
];

// Function to get translated responses - these keys will be translated
export const getRestaurantResponses = (
  t: (key: string) => string,
): string[] => [
  t('chat.responses.step1'),
  t('chat.responses.step2'),
  t('chat.responses.step3'),
  t('chat.responses.step4'),
  t('chat.responses.step5'),
  t('chat.responses.step6'),
];

// Fallback for backwards compatibility
export const restaurantPrompts: string[] = [
  `Help me create a website for my new restaurant called Savory Seasons. It's a farm-to-table place and I need something clean and professional. Just get me started with the basic structure.`,
  `Okay, that's a good skeleton. Now can you apply our brand's look and feel? We use earthy tones and a classic serif font. Let's get the styling foundation and a better navigation bar in place.`,
  `This looks much better! Now can you make the hero section more visually appealing? Maybe add a nice restaurant photo and some smooth animations to make it feel more welcoming?`,
  `Perfect! Now I need to showcase our menu. We have appetizers, main courses, and desserts. Can you add a menu section with some appetizing food photos? Our customers need to see what we offer.`,
  `The menu looks fantastic! Now I need a way for customers to make reservations. Can you add a reservation system where they can book tables? I'd like fields for date, time, party size, and any special requests.`,
  `We're almost there! Can you add a feedback section where customers can leave reviews with star ratings? Also, I need an About Us page that tells our farm-to-table story. Let's polish this up!`,
];

// Fallback for backwards compatibility
export const restaurantResponses: string[] = [
  "Perfect! I'll help you create a website for Savory Seasons. Let me start with a clean, simple foundation - just the basic HTML structure and minimal styling to get us going. I'm setting up the main sections you'll need: home, menu, reservations, and about.",
  "Of course. I'll establish a design system using your brand's earthy colors and a classic serif font. I'm also updating the layout with a professional fixed navigation bar. This will set the visual tone for the rest of the site.",
  "Great feedback! Now I'm making that hero section stand out. I'm generating a beautiful restaurant interior image and applying it as a full-screen background. I've also added some smooth 'fade-in' animations to make it feel welcoming and elegant.",
  "Excellent! Now for the exciting part - your menu showcase. I'm building a complete menu section and generating 6 mouth-watering food images: 2 appetizers (bruschetta and burrata), 2 main courses (salmon and ribeye), and 2 desserts (cheesecake and chocolate lava cake). Each image is crafted to highlight the fresh, artisanal quality that defines farm-to-table dining.",
  "Perfect! Your reservation system is now ready. I've created a comprehensive booking form with date/time selection, party size options, and a special requests field. Added proper validation and a confirmation system so customers get immediate feedback when they book. The styling matches your elegant restaurant aesthetic.",
  "Almost done! I've added an interactive feedback system where customers can leave star ratings and written reviews. Also created a compelling About Us section that tells your farm-to-table story - focusing on your 2020 founding, local farm partnerships, and seasonal menu philosophy. Everything now works together seamlessly for a complete restaurant experience!",
];

type TFn = (key: string) => string;

export const getRestaurantCodeSteps = (t: TFn) => [
  {
    html: `<!DOCTYPE html>
<html>
<head>
  <title>${''}${t('chat.restaurant_name')}</title>
</head>
<body>
  <header>
    <h1>${t('chat.restaurant_name')}</h1>
    <nav>
      <a href="#home">${t('chat.website.nav.home')}</a>
      <a href="#menu">${t('chat.website.nav.menu')}</a>
      <a href="#reservations">${t('chat.website.nav.reservations')}</a>
      <a href="#about">${t('chat.website.nav.about')}</a>
    </nav>
  </header>
  <main>
    <section id="home">
      <h2>${t('chat.website.skeleton.welcome')}</h2>
      <p>${t('chat.website.skeleton.tagline')}</p>
    </section>
    <section id="menu">
      <h2>${t('chat.website.nav.menu')}</h2>
      <p>${t('chat.website.skeleton.coming_soon')}</p>
    </section>
    <section id="reservations">
      <h2>${t('chat.website.nav.reservations')}</h2>
      <p>${t('chat.website.skeleton.coming_soon')}</p>
    </section>
    <section id="about">
      <h2>${t('chat.website.nav.about')}</h2>
      <p>${t('chat.website.skeleton.coming_soon')}</p>
    </section>
  </main>
</body>
</html>`,
    css: `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  line-height: 1.6;
}

header {
  background: #f4f4f4;
  padding: 1rem;
  text-align: center;
}

nav a {
  margin: 0 1rem;
  text-decoration: none;
  color: #333;
  pointer-events: none;
  cursor: default;
}

a {
  pointer-events: none;
  cursor: default;
}

section {
  padding: 2rem;
  text-align: center;
}`,
    js: '',
  },
  {
    html: `<!-- Updated header with enhanced navigation -->
<header>
  <nav class="navbar">
    <div class="logo">${t('chat.restaurant_name')}</div>
    <div class="nav-links">
      <a href="#home">${t('chat.website.nav.home')}</a>
      <a href="#menu">${t('chat.website.nav.menu')}</a>
      <a href="#reservations">${t('chat.website.nav.reservations')}</a>
      <a href="#about">${t('chat.website.nav.about')}</a>
    </div>
  </nav>
</header>`,
    css: `:root {
  --primary-color: #8C6E4D;
  --secondary-color: #4A573E;
  --background-color: #F9F6F2;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Georgia', serif;
  line-height: 1.6;
  color: #333;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.95);
  position: fixed;
  width: 100%;
  top: 0;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.logo {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--primary-color);
}

.nav-links a {
  margin-left: 2rem;
  text-decoration: none;
  color: #333;
  font-weight: 500;
  transition: color 0.3s;
  pointer-events: none;
  cursor: default;
}

.nav-links a:hover {
  color: var(--primary-color);
}

section {
  padding: 4rem 2rem;
  text-align: center;
}`,
    js: '',
  },
  {
    html: `<!-- Enhanced hero section with background image -->
<section id="home" class="hero">
  <div class="hero-content">
    <h1>${t('chat.website.skeleton.welcome')}</h1>
    <p class="tagline">${t('chat.website.hero.tagline')}</p>
    <a href="#reservations" class="cta-button">${t('chat.website.hero.cta')}</a>
  </div>
</section>`,
    css: `.hero {
  height: 100vh;
  padding-top: 60px;
  background: linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)),
              url('https://images.unsplash.com/photo-1414235077428-338989a2e8c0');
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: white;
}

.hero-content h1 {
  font-size: 4rem;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.7);
  animation: fadeInUp 1s ease-out;
}

.tagline {
  font-size: 1.5rem;
  margin-bottom: 2rem;
  animation: fadeInUp 1s ease-out 0.3s both;
}

.cta-button {
  display: inline-block;
  background: var(--primary-color);
  color: white;
  padding: 1rem 2rem;
  text-decoration: none;
  border-radius: 5px;
  font-weight: bold;
  transition: transform 0.3s, background 0.3s;
  animation: fadeInUp 1s ease-out 0.6s both;
}

.cta-button:hover {
  transform: translateY(-2px);
  background: #7a5d42;
}

a.cta-button {
  pointer-events: initial;
  cursor: pointer;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}`,
    js: '',
  },
  {
    html: `<!-- Replace the menu section with full content -->
<section id="menu" class="container">
  <h2 class="section-title">${t('chat.website.menu_section.title')}</h2>
  <div id="menu-loader">${t('chat.website.menu_section.loading')}</div>
  <div id="menu-grid" style="display:none;">
    <div class="menu-category">
      <h3>${t('chat.website.menu_section.appetizers')}</h3>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1572695157366-5e585ab2b69f" alt="Heirloom Tomato Bruschetta" />
        <div>
          <h4>Heirloom Tomato Bruschetta</h4>
          <p>Fresh heirloom tomatoes on toasted artisan bread with balsamic glaze.</p>
        </div>
        <span>$14</span>
      </div>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1551218808-94e220e084d2" alt="Burrata Caprese" />
        <div>
          <h4>Burrata Caprese</h4>
          <p>Creamy burrata cheese with vine-ripened tomatoes and fresh basil.</p>
        </div>
        <span>$18</span>
      </div>
    </div>
    <div class="menu-category">
      <h3>${t('chat.website.menu_section.main_courses')}</h3>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1467003909585-2f8a72700288" alt="Pan-Seared Salmon" />
        <div>
          <h4>Pan-Seared Salmon</h4>
          <p>Atlantic salmon with roasted asparagus and quinoa pilaf.</p>
        </div>
        <span>$32</span>
      </div>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1546833999-b9f581a1996d" alt="Grass-Fed Ribeye" />
        <div>
          <h4>Grass-Fed Ribeye</h4>
          <p>12oz grass-fed ribeye with roasted root vegetables.</p>
        </div>
        <span>$45</span>
      </div>
    </div>
    <div class="menu-category">
      <h3>${t('chat.website.menu_section.desserts')}</h3>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1533134242443-d4fd215305ad" alt="Lavender Cheesecake" />
        <div>
          <h4>Lavender Cheesecake</h4>
          <p>House-made cheesecake with lavender and berry coulis.</p>
        </div>
        <span>$12</span>
      </div>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1551024506-0bccd828d307" alt="Chocolate Lava Cake" />
        <div>
          <h4>Chocolate Lava Cake</h4>
          <p>Warm chocolate cake with molten center and vanilla ice cream.</p>
        </div>
        <span>$14</span>
      </div>
    </div>
  </div>
</section>`,
    css: `.container { max-width: 1100px; margin: 0 auto; padding: 4rem 2rem; }
.section-title { text-align: center; font-size: 2.8rem; margin-bottom: 3rem; color: var(--secondary-color); }
#menu-loader { text-align: center; padding: 3rem; font-size: 1.2rem; color: #666; }
.menu-category { margin-bottom: 3rem; }
.menu-category h3 { font-size: 2rem; border-bottom: 2px solid var(--primary-color); padding-bottom: 1rem; margin-bottom: 2rem; }
.menu-item { display: grid; grid-template-columns: 120px 1fr auto; gap: 1.5rem; align-items: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #eee; }
.menu-item img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.menu-item h4 { margin: 0 0 0.5rem; font-size: 1.3rem; color: var(--secondary-color); }
.menu-item p { margin: 0; color: #666; font-size: 0.95rem; }
.menu-item span { font-size: 1.4rem; font-weight: bold; color: var(--primary-color); }`,
    js: `setTimeout(() => {
document.getElementById('menu-loader').style.display = 'none';
document.getElementById('menu-grid').style.display = 'block';
}, 2000);`,
  },
  {
    html: `<!-- Replace the reservations section with booking form -->
<section id="reservations" class="container">
  <h2 class="section-title">${t('chat.website.reservations_section.title')}</h2>
  <form id="reservation-form">
    <input type="text" placeholder="${t('chat.website.reservations_section.name_placeholder')}" required />
    <input type="email" placeholder="${t('chat.website.reservations_section.email_placeholder')}" required />
    <input type="tel" placeholder="${t('chat.website.reservations_section.phone_placeholder')}" required />
    <input type="date" required />
    <input type="time" required />
    <select required>
      <option value="">${t('chat.website.reservations_section.party_size')}</option>
      <option value="1">${t('chat.website.reservations_section.party_1')}</option>
      <option value="2">${t('chat.website.reservations_section.party_2')}</option>
      <option value="3">${t('chat.website.reservations_section.party_3')}</option>
      <option value="4">${t('chat.website.reservations_section.party_4')}</option>
      <option value="5">${t('chat.website.reservations_section.party_5')}</option>
    </select>
    <textarea placeholder="${t('chat.website.reservations_section.special_requests')}"></textarea>
    <button type="submit">${t('chat.website.reservations_section.submit')}</button>
  </form>
  <div id="reservation-confirmation" style="display:none;">
    <div class="success-message">
      <h3>${t('chat.website.reservations_section.success_title')}</h3>
      <p>${t('chat.website.reservations_section.success_message')}</p>
    </div>
  </div>
</section>`,
    css: `form { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 700px; margin: 0 auto; }
input, select, textarea { padding: 1rem; font-size: 1rem; border: 2px solid #ddd; border-radius: 5px; transition: border-color 0.3s; }
input:focus, select:focus, textarea:focus { border-color: var(--primary-color); outline: none; }
textarea { grid-column: 1 / -1; min-height: 100px; resize: vertical; }
form button { grid-column: 1 / -1; background: var(--secondary-color); color: white; padding: 1.2rem; border: none; border-radius: 5px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: background-color 0.3s; }
form button:hover { background: #3a4530; }
.success-message { text-align: center; padding: 2rem; background: #e8f5e8; border-radius: 8px; border: 2px solid #4caf50; max-width: 700px; margin: 0 auto; }
.success-message h3 { color: #2e7d32; margin-top: 0; }`,
    js: `document.getElementById('reservation-form').addEventListener('submit', (e) => {
e.preventDefault();
document.getElementById('reservation-form').style.display = 'none';
document.getElementById('reservation-confirmation').style.display = 'block';
});`,
  },
  {
    html: `<!-- Add feedback section content -->
<section id="feedback" class="container">
  <h2 class="section-title">${t('chat.website.feedback_section.title')}</h2>
  <form id="feedback-form">
    <input type="text" placeholder="${t('chat.website.feedback_section.name_placeholder')}" />
    <input type="email" placeholder="${t('chat.website.feedback_section.email_placeholder')}" />
    <div class="rating-section">
      <label>${t('chat.website.feedback_section.rating_label')}</label>
      <div class="stars">
        <span class="star" data-rating="1">★</span>
        <span class="star" data-rating="2">★</span>
        <span class="star" data-rating="3">★</span>
        <span class="star" data-rating="4">★</span>
        <span class="star" data-rating="5">★</span>
      </div>
    </div>
    <textarea placeholder="${t('chat.website.feedback_section.review_placeholder')}" required></textarea>
    <button type="submit">${t('chat.website.feedback_section.submit')}</button>
  </form>
  <div id="feedback-confirmation" style="display:none;">
    <div class="feedback-success">
      <h3>${t('chat.website.feedback_section.success_title')}</h3>
      <p>${t('chat.website.feedback_section.success_message')}</p>
    </div>
  </div>
</section>

<!-- Add about section content -->
<section id="about" class="container">
  <h2 class="section-title">${t('chat.website.about_section.title')}</h2>
  <div class="about-content">
    <p class="about-text">${t('chat.website.about_section.para1')}</p>
    <p class="about-text">${t('chat.website.about_section.para2')}</p>
    <p class="about-text">${t('chat.website.about_section.para3')}</p>
  </div>
</section>`,
    css: `.rating-section { grid-column: 1 / -1; }
.rating-section label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
.stars { display: flex; gap: 0.25rem; }
.star { font-size: 2rem; color: #ddd; cursor: pointer; transition: color 0.2s; }
.star:hover,
.star.active { color: #ffd700; }
textarea { grid-column: 1 / -1; min-height: 120px; }
#feedback-form button { background: var(--primary-color); }
#feedback-form button:hover { background: #7a5d42; }
.feedback-success { text-align: center; padding: 2rem; background: #f0f8ff; border-radius: 8px; border: 2px solid #2196f3; max-width: 700px; margin: 0 auto; }
.feedback-success h3 { color: #1565c0; margin-top: 0; }
.about-content { max-width: 800px; margin: 0 auto; text-align: center; }
.about-text { font-size: 1.1rem; line-height: 1.8; margin-bottom: 2rem; color: #555; }`,
    js: `document.getElementById('feedback-form').addEventListener('submit', (e) => {
e.preventDefault();
document.getElementById('feedback-form').style.display = 'none';
document.getElementById('feedback-confirmation').style.display = 'block';
});

// Star rating functionality
document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('click', (e) => {
    const rating = e.target.dataset.rating;
    document.querySelectorAll('.star').forEach((s, index) => {
      s.classList.toggle('active', index < rating);
    });
  });
});`,
  },
];

export const restaurantCodeSteps = [
  {
    // Step 1: Minimal HTML skeleton
    html: `<!DOCTYPE html>
<html>
<head>
  <title>Savory Seasons</title>
</head>
<body>
  <header>
    <h1>Savory Seasons</h1>
    <nav>
      <a href="#home">Home</a>
      <a href="#menu">Menu</a>
      <a href="#reservations">Reservations</a>
      <a href="#about">About</a>
    </nav>
  </header>

  <main>
    <section id="home">
      <h2>Welcome to Savory Seasons</h2>
      <p>Farm to Table Excellence</p>
    </section>

    <section id="menu">
      <h2>Menu</h2>
      <p>Coming soon...</p>
    </section>

    <section id="reservations">
      <h2>Reservations</h2>
      <p>Coming soon...</p>
    </section>

    <section id="about">
      <h2>About</h2>
      <p>Coming soon...</p>
    </section>
  </main>
</body>
</html>`,
    css: `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  line-height: 1.6;
}

header {
  background: #f4f4f4;
  padding: 1rem;
  text-align: center;
}

nav a {
  margin: 0 1rem;
  text-decoration: none;
  color: #333;
  pointer-events: none;
  cursor: default;
}

a {
  pointer-events: none;
  cursor: default;
}

section {
  padding: 2rem;
  text-align: center;
}`,
    js: '',
  },
  {
    // Step 2: NEW - Apply brand styling and navbar layout
    html: `<!-- Updated header with enhanced navigation -->
<header>
  <nav class="navbar">
    <div class="logo">Savory Seasons</div>
    <div class="nav-links">
      <a href="#home">Home</a>
      <a href="#menu">Menu</a>
      <a href="#reservations">Reservations</a>
      <a href="#about">About</a>
    </div>
  </nav>
</header>`,
    css: `:root {
  --primary-color: #8C6E4D;
  --secondary-color: #4A573E;
  --background-color: #F9F6F2;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Georgia', serif;
  line-height: 1.6;
  color: #333;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.95);
  position: fixed;
  width: 100%;
  top: 0;
  z-index: 1000;
  backdrop-filter: blur(10px);
}

.logo {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--primary-color);
}

.nav-links a {
  margin-left: 2rem;
  text-decoration: none;
  color: #333;
  font-weight: 500;
  transition: color 0.3s;
  pointer-events: none;
  cursor: default;
}

.nav-links a:hover {
  color: var(--primary-color);
}

section {
  padding: 4rem 2rem;
  text-align: center;
}`,
    js: '',
  },
  {
    // Step 3: NEW - Add hero image and animations (incremental)
    html: `<!-- Enhanced hero section with background image -->
<section id="home" class="hero">
  <div class="hero-content">
    <h1>Welcome to Savory Seasons</h1>
    <p class="tagline">Discover the freshest farm-to-table experience</p>
    <a href="#reservations" class="cta-button">Book Your Table</a>
  </div>
</section>`,
    css: `.hero {
  height: 100vh;
  padding-top: 60px; /* Offset for fixed navbar */
  background: linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)),
              url('https://images.unsplash.com/photo-1414235077428-338989a2e8c0');
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: white;
}

.hero-content h1 {
  font-size: 4rem;
  margin-bottom: 1rem;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.7);
  animation: fadeInUp 1s ease-out;
}

.tagline {
  font-size: 1.5rem;
  margin-bottom: 2rem;
  animation: fadeInUp 1s ease-out 0.3s both;
}

.cta-button {
  display: inline-block;
  background: var(--primary-color);
  color: white;
  padding: 1rem 2rem;
  text-decoration: none;
  border-radius: 5px;
  font-weight: bold;
  transition: transform 0.3s, background 0.3s;
  animation: fadeInUp 1s ease-out 0.6s both;
}

.cta-button:hover {
  transform: translateY(-2px);
  background: #7a5d42;
}

a.cta-button {
  pointer-events: initial;
  cursor: pointer;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}`,
    js: '',
  },
  {
    // Step 4: Add menu section (Original Step 3)
    html: `<!-- Replace the menu section with full content -->
<section id="menu" class="container">
  <h2 class="section-title">Our Seasonal Menu</h2>
  <div id="menu-loader">Generating custom food images and loading menu...</div>
  <div id="menu-grid" style="display:none;">
    <div class="menu-category">
      <h3>Appetizers</h3>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1572695157366-5e585ab2b69f" alt="Heirloom Tomato Bruschetta" />
        <div>
          <h4>Heirloom Tomato Bruschetta</h4>
          <p>Fresh heirloom tomatoes on toasted artisan bread with balsamic glaze.</p>
        </div>
        <span>$14</span>
      </div>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1551218808-94e220e084d2" alt="Burrata Caprese" />
        <div>
          <h4>Burrata Caprese</h4>
          <p>Creamy burrata cheese with vine-ripened tomatoes and fresh basil.</p>
        </div>
        <span>$18</span>
      </div>
    </div>
    <div class="menu-category">
      <h3>Main Courses</h3>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1467003909585-2f8a72700288" alt="Pan-Seared Salmon" />
        <div>
          <h4>Pan-Seared Salmon</h4>
          <p>Atlantic salmon with roasted asparagus and quinoa pilaf.</p>
        </div>
        <span>$32</span>
      </div>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1546833999-b9f581a1996d" alt="Grass-Fed Ribeye" />
        <div>
          <h4>Grass-Fed Ribeye</h4>
          <p>12oz grass-fed ribeye with roasted root vegetables.</p>
        </div>
        <span>$45</span>
      </div>
    </div>
    <div class="menu-category">
      <h3>Desserts</h3>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1533134242443-d4fd215305ad" alt="Lavender Cheesecake" />
        <div>
          <h4>Lavender Cheesecake</h4>
          <p>House-made cheesecake with lavender and berry coulis.</p>
        </div>
        <span>$12</span>
      </div>
      <div class="menu-item">
        <img src="https://images.unsplash.com/photo-1551024506-0bccd828d307" alt="Chocolate Lava Cake" />
        <div>
          <h4>Chocolate Lava Cake</h4>
          <p>Warm chocolate cake with molten center and vanilla ice cream.</p>
        </div>
        <span>$14</span>
      </div>
    </div>
  </div>
</section>`,
    css: `.container { max-width: 1100px; margin: 0 auto; padding: 4rem 2rem; }
.section-title { text-align: center; font-size: 2.8rem; margin-bottom: 3rem; color: var(--secondary-color); }
#menu-loader { text-align: center; padding: 3rem; font-size: 1.2rem; color: #666; }
.menu-category { margin-bottom: 3rem; }
.menu-category h3 { font-size: 2rem; border-bottom: 2px solid var(--primary-color); padding-bottom: 1rem; margin-bottom: 2rem; }
.menu-item { display: grid; grid-template-columns: 120px 1fr auto; gap: 1.5rem; align-items: center; margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid #eee; }
.menu-item img { width: 120px; height: 90px; object-fit: cover; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.menu-item h4 { margin: 0 0 0.5rem; font-size: 1.3rem; color: var(--secondary-color); }
.menu-item p { margin: 0; color: #666; font-size: 0.95rem; }
.menu-item span { font-size: 1.4rem; font-weight: bold; color: var(--primary-color); }`,
    js: `setTimeout(() => {
document.getElementById('menu-loader').style.display = 'none';
document.getElementById('menu-grid').style.display = 'block';
}, 2000);`,
  },
  {
    // Step 5: Add reservation system (Original Step 4)
    html: `<!-- Replace the reservations section with booking form -->
<section id="reservations" class="container">
  <h2 class="section-title">Make a Reservation</h2>
  <form id="reservation-form">
    <input type="text" placeholder="Full Name" required />
    <input type="email" placeholder="Email Address" required />
    <input type="tel" placeholder="Phone Number" required />
    <input type="date" required />
    <input type="time" required />
    <select required>
      <option value="">Party Size</option>
      <option value="1">1 Person</option>
      <option value="2">2 People</option>
      <option value="3">3 People</option>
      <option value="4">4 People</option>
      <option value="5">5+ People</option>
    </select>
    <textarea placeholder="Special requests or dietary restrictions (optional)"></textarea>
    <button type="submit">Book Your Table</button>
  </form>
  <div id="reservation-confirmation" style="display:none;">
    <div class="success-message">
      <h3>Reservation Confirmed!</h3>
      <p>Thank you! We've received your reservation request and will contact you within 24 hours to confirm your booking.</p>
    </div>
  </div>
</section>`,
    css: `form { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 700px; margin: 0 auto; }
input, select, textarea { padding: 1rem; font-size: 1rem; border: 2px solid #ddd; border-radius: 5px; transition: border-color 0.3s; }
input:focus, select:focus, textarea:focus { border-color: var(--primary-color); outline: none; }
textarea { grid-column: 1 / -1; min-height: 100px; resize: vertical; }
form button { grid-column: 1 / -1; background: var(--secondary-color); color: white; padding: 1.2rem; border: none; border-radius: 5px; font-size: 1.1rem; font-weight: bold; cursor: pointer; transition: background-color 0.3s; }
form button:hover { background: #3a4530; }
.success-message { text-align: center; padding: 2rem; background: #e8f5e8; border-radius: 8px; border: 2px solid #4caf50; max-width: 700px; margin: 0 auto; }
.success-message h3 { color: #2e7d32; margin-top: 0; }`,
    js: `document.getElementById('reservation-form').addEventListener('submit', (e) => {
e.preventDefault();
document.getElementById('reservation-form').style.display = 'none';
document.getElementById('reservation-confirmation').style.display = 'block';
});`,
  },
  {
    // Step 6: Add feedback system and about content (Original Step 5)
    html: `<!-- Add feedback section content -->
<section id="feedback" class="container">
  <h2 class="section-title">Share Your Experience</h2>
  <form id="feedback-form">
    <input type="text" placeholder="Your Name (Optional)" />
    <input type="email" placeholder="Email (Optional)" />
    <div class="rating-section">
      <label>Rate Your Experience:</label>
      <div class="stars">
        <span class="star" data-rating="1">★</span>
        <span class="star" data-rating="2">★</span>
        <span class="star" data-rating="3">★</span>
        <span class="star" data-rating="4">★</span>
        <span class="star" data-rating="5">★</span>
      </div>
    </div>
    <textarea placeholder="Tell us about your experience..." required></textarea>
    <button type="submit">Submit Feedback</button>
  </form>
  <div id="feedback-confirmation" style="display:none;">
    <div class="feedback-success">
      <h3>Thank You!</h3>
      <p>We appreciate your feedback and will use it to improve our service.</p>
    </div>
  </div>
</section>

<!-- Add about section content -->
<section id="about" class="container">
  <h2 class="section-title">Our Story</h2>
  <div class="about-content">
    <p class="about-text">Founded in 2020, Savory Seasons was born from a passion for connecting our community with the freshest local ingredients. We partner directly with nearby farms to bring you seasonal dishes that celebrate the natural flavors of our region.</p>
    <p class="about-text">Our chef-driven menu changes with the seasons, ensuring every visit offers something new and exciting. From our wood-fired grill to our house-made pastas, every dish is crafted with care and attention to detail.</p>
    <p class="about-text">Join us for an unforgettable dining experience where every meal tells the story of our local farmers, artisans, and the passionate team that brings it all together.</p>
  </div>
</section>`,
    css: `.rating-section { grid-column: 1 / -1; }
.rating-section label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
.stars { display: flex; gap: 0.25rem; }
.star { font-size: 2rem; color: #ddd; cursor: pointer; transition: color 0.2s; }
.star:hover,
.star.active { color: #ffd700; }
textarea { grid-column: 1 / -1; min-height: 120px; }
#feedback-form button { background: var(--primary-color); }
#feedback-form button:hover { background: #7a5d42; }
.feedback-success { text-align: center; padding: 2rem; background: #f0f8ff; border-radius: 8px; border: 2px solid #2196f3; max-width: 700px; margin: 0 auto; }
.feedback-success h3 { color: #1565c0; margin-top: 0; }
.about-content { max-width: 800px; margin: 0 auto; text-align: center; }
.about-text { font-size: 1.1rem; line-height: 1.8; margin-bottom: 2rem; color: #555; }`,
    js: `document.getElementById('feedback-form').addEventListener('submit', (e) => {
e.preventDefault();
document.getElementById('feedback-form').style.display = 'none';
document.getElementById('feedback-confirmation').style.display = 'block';
});

// Star rating functionality
document.querySelectorAll('.star').forEach(star => {
  star.addEventListener('click', (e) => {
    const rating = e.target.dataset.rating;
    document.querySelectorAll('.star').forEach((s, index) => {
      s.classList.toggle('active', index < rating);
    });
  });
});`,
  },
];

// Rate card prices (cents per 1M tokens) — must stay in sync with the
// Metronome rate card (rate card id: 45f2021d-1fda-41f4-aada-86b3f6d403c0).
export const RATE_CARD_PRICES = {
  // lora-mythic-4.6  (modelType: 'standard' | 'mini' maps here for chat)
  standard: { inputCentsPerM: 300, outputCentsPerM: 1500 },
  // lora-prime-5.4   (modelType: 'large')
  large:    { inputCentsPerM: 250, outputCentsPerM: 1500 },
  // lora-prime-mini-5.4 (modelType: 'mini')
  mini:     { inputCentsPerM:  75, outputCentsPerM:  450 },
} as const;

function tokenCost(
  inputTokens: number,
  outputTokens: number,
  modelType: keyof typeof RATE_CARD_PRICES,
): number {
  const { inputCentsPerM, outputCentsPerM } = RATE_CARD_PRICES[modelType];
  const cents =
    (inputTokens / 1_000_000) * inputCentsPerM +
    (outputTokens / 1_000_000) * outputCentsPerM;
  return Math.round(cents) / 100; // dollars, rounded to nearest cent
}

export const consumptionData: ConsumptionData[] = [
  // Chat 1: Basic structure — $2.40 (running $2.40, under $5 trial)
  {
    modelType: 'standard',
    inputTokens: 200000,
    outputTokens: 120000,
    images: [],
    creditsCost: tokenCost(200000, 120000, 'standard'),
  },
  // Chat 2: Apply brand styling — $2.85 (running $5.25, trial credit exhausted → upgrade prompt)
  {
    modelType: 'standard',
    inputTokens: 200000,
    outputTokens: 150000,
    images: [],
    creditsCost: tokenCost(200000, 150000, 'standard'),
  },
  // Chat 3: Hero image + animations — $3.90 (running $8.10, over $5 → upgrade prompt)
  {
    modelType: 'standard',
    inputTokens: 300000,
    outputTokens: 200000,
    images: [{ type: 'basic', count: 1, operation: 'generated' }],
    creditsCost: tokenCost(300000, 200000, 'standard'),
  },
  // --- USER UPGRADES ---
  // Chat 4: Menu with 6 images (large model) — $2.75
  {
    modelType: 'large',
    inputTokens: 500000,
    outputTokens: 100000,
    images: [{ type: 'basic', count: 6, operation: 'generated' }],
    creditsCost: tokenCost(500000, 100000, 'large'),
  },
  // Chat 5: Reservation system — $10.20
  {
    modelType: 'standard',
    inputTokens: 400000,
    outputTokens: 600000,
    images: [],
    creditsCost: tokenCost(400000, 600000, 'standard'),
  },
  // Chat 6: Feedback & About — $8.40
  {
    modelType: 'standard',
    inputTokens: 300000,
    outputTokens: 500000,
    images: [],
    creditsCost: tokenCost(300000, 500000, 'standard'),
  },
];
