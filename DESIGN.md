# TisiOps

## Overview
TisiOps is a clean, technical, developer-first design system derived from the supplied reference landing-page screenshot. The visual language combines a warm off-white canvas, charcoal typography, a vivid orange brand accent, restrained borders, and a dense binary-code texture that makes the interface feel computational without becoming visually heavy. The layout is intentionally spacious: the navigation is compact and orderly, the hero headline sits deep into the viewport with generous breathing room, and the floating AI command bar is treated as a persistent utility rather than a decorative card.

The overall aesthetic is modern, editorial, and slightly brutalist. It avoids excessive rounding, glassmorphism, deep shadows, and colorful gradients. Most hierarchy comes from scale, whitespace, contrast, and the single orange accent. The page should feel precise, fast, and engineered.

> Screenshot reference size: 2048 × 1260 px. Pixel-based measurements below are approximate and should be treated as implementation guidance rather than exact source CSS.

## Colors
- **Primary** (#FF4400): Dashboard CTA, active controls, "New" badge border/text, AI command emphasis, brand accent
- **Primary Hover** (#E63D00): Hovered orange buttons and interactive elements
- **Primary Active** (#CC3600): Pressed/active orange controls
- **Primary Soft** (#FFF6F3): Light orange-tinted badge and subtle accent fills
- **Primary Disabled** (#FFD9CA): Disabled or inactive orange action buttons
- **Background** (#F9F7F6): Main page background and top navigation
- **Surface** (#FFFFFF): Announcement card, floating AI command bar, utility surfaces
- **Text Primary** (#2E2D2D): Hero headline and major display text
- **Text Strong** (#141414): Announcement message and strong labels
- **Text Default** (#242424): Navigation links and standard interface text
- **Text Secondary** (#777473): Placeholder text, supporting copy, inactive utility text
- **Border** (#EAEAEA): Card outlines, floating command bar border, subtle separators
- **Border Warm** (#DDD9D7): Warm neutral control outlines when a slightly stronger border is needed
- **Pattern Orange** (#FF4400 at 10–35% opacity): Repeating binary background texture
- **Icon Muted** (#8C8C8C): Upload/cloud and secondary utility icons
- **White** (#FFFFFF): Text on primary buttons and active icons

### Core Four-Color Palette
Use these four tokens when a simplified version of the design system is needed:
- **Background**: #F9F7F6
- **Foreground**: #2E2D2D
- **Primary**: #FF4400
- **Surface**: #FFFFFF

### Suggested CSS Tokens
```css
:root {
  --background: #f9f7f6;
  --surface: #ffffff;

  --primary: #ff4400;
  --primary-hover: #e63d00;
  --primary-active: #cc3600;
  --primary-soft: #fff6f3;
  --primary-disabled: #ffd9ca;

  --text-primary: #2e2d2d;
  --text-default: #242424;
  --text-strong: #141414;
  --text-secondary: #777473;

  --border: #eaeaea;
  --border-warm: #ddd9d7;
  --icon-muted: #8c8c8c;
}
```

## Typography
- **Display Font**: Inter or a close modern grotesk/sans-serif
- **Body Font**: Inter
- **Fallback Stack**: "Helvetica Neue", Arial, sans-serif
- **Code / Pattern Font**: A neutral monospace such as JetBrains Mono or ui-monospace

The exact source font cannot be reliably identified from the raster screenshot alone. Inter is the closest practical implementation choice because it reproduces the neutral geometry, tight spacing, and clean developer-product feel visible in the reference.

The hero heading is large but not ultra-heavy. Use a medium-to-semibold weight rather than an 800–900 display weight. Desktop hero text should sit around 72–80px, with approximately 76px as the preferred target at the 2048px reference width. Use 500–600 weight, about 1.18–1.20 line height, and tight negative tracking around -0.035em to -0.04em. The headline color is #2E2D2D.

Navigation uses 16px, 500 weight, approximately 24px line height, and slight negative tracking around -0.01em. Announcement and floating-command text also use 16px; stronger phrases use 500–600 weight while supporting/placeholder text remains 400.

Recommended type scale:
- **12px**: Small metadata or utility labels
- **14px**: Small controls, pattern/supporting UI
- **16px**: Navigation, announcement text, command bar text, buttons
- **20–24px**: Large utility labels or section support text if introduced
- **52–64px**: Tablet/smaller desktop hero
- **72–80px**: Reference desktop hero
- **80px max**: Recommended cap for this specific layout

### Hero Typography
```css
.hero-title {
  max-width: 1250px;
  font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  font-size: clamp(52px, 4.3vw, 80px);
  line-height: 1.2;
  letter-spacing: -0.04em;
  font-weight: 550;
  color: #2e2d2d;
}
```

Reference hero copy:
```text
Your AI DevOps Engineer
handling all your databases
```

For faithful recreation, control the line break intentionally rather than letting the browser wrap unpredictably.

## Elevation
Elevation is minimal. The design relies primarily on border contrast, scale, and whitespace rather than floating-card effects.

Navigation has either no visible shadow or only a nearly imperceptible bottom divider. The announcement card uses a very light 0 1px 3px rgba(0, 0, 0, 0.04) shadow. The floating AI command bar is the only component that receives meaningful elevation because it sits above page content as a persistent utility. Use a soft, broad shadow rather than a dark or sharp drop shadow.

Recommended elevation:
- **Navigation**: 0 1px 0 rgba(46, 45, 45, 0.05) or a subtle 1px divider
- **Announcement Card**: 0 1px 3px rgba(0, 0, 0, 0.04)
- **Floating AI Bar**: 0 8px 30px rgba(0, 0, 0, 0.07), 0 2px 8px rgba(0, 0, 0, 0.04)
- **Buttons**: No default shadow
- **Hover Lift**: Avoid large transforms; subtle color change is preferred

The philosophy is flat and engineered: surfaces should feel placed, not floating everywhere.

## Components
- **Top Navigation**: Approximately 84px high, #F9F7F6 background, full width, with generous left/right page padding. Logo is aligned left; Products, Resources, Community, and Pricing occupy the central navigation; theme controls, language control, and Dashboard CTA align right. Navigation links use 16px / 500. Desktop nav gap is approximately 48–56px. Keep the navigation vertically centered and visually quiet.
- **Logo Area**: Approximate rendered logo size is 140–145px wide by 32–35px high at the reference width. Preserve generous whitespace around it. Do not enlarge the logo to compete with the hero.
- **Dropdown Navigation Links**: Products, Resources, and Community include small downward chevrons around 12–14px. Keep icon-to-label spacing tight, around 6–8px. Pricing appears as a simple text link.
- **Theme Selector**: A rounded capsule approximately 135px wide and 52px high. Use a warm light border, full pill radius, and three compact icon areas for light/system/dark modes. The selected control may use #FFF0EA or #FFF6F3 with #FF4400 icon color. Internal circular control is approximately 40px square.
- **Language Control**: A standalone compact icon button between theme selector and Dashboard. Use transparent background, approximately 40–44px interaction area, charcoal icon, and no heavy border.
- **Dashboard Button**: Strong orange CTA with #FFFFFF text. Approximate reference height is 54px, horizontal padding 22–24px, 16px text at 600 weight, and 4–6px corner radius. Do not use a pill shape. Hover darkens to #E63D00; active state may use #CC3600.
- **Hero Section**: Begins directly below the 84px header and fills most of the remaining viewport. At the 2048px reference size, headline left edge is approximately 136–140px from the viewport and begins around y=450px. The hero intentionally includes a very large empty upper region before the headline. Recommended desktop padding is approximately 140px horizontal and 350px top at the reference size. Use responsive `clamp()` values rather than fixed spacing at all breakpoints.
- **Hero Headline**: Two-line display statement with large medium-weight sans-serif type. The first line reads "Your AI DevOps Engineer"; the second reads "handling all your databases". Use #2E2D2D and no decorative effects.
- **Binary Background Pattern**: Repeating 0 and 1 characters fill the hero behind all content. Use #FF4400 at approximately 10–35% opacity. The pattern should not be uniformly visible: keep the left and upper portions lighter while allowing denser/darker clusters toward the right and lower sections. A masked SVG, canvas texture, or absolutely positioned monospace text field with gradient opacity masks works well. Keep the pattern non-interactive with `pointer-events: none`.
- **Announcement Card**: White inline card positioned below the hero headline. Approximate height is 68–70px. The card has a 1px #EAEAEA border, 2–4px radius, and very subtle shadow. It should remain visually rectangular rather than pill-shaped.
- **"New" Badge Segment**: The left segment of the announcement card. Use #FFF6F3 or white background, #FF4400 border and text, 16px / 600 typography, 20px horizontal padding, and full component height. Approximate width is 85–90px.
- **Announcement Message**: Text reads "Meet TisiOps: Pick Your Preferred OS When Buying a Server". Use #141414, 16px, 600 weight, and single-line desktop layout. Add generous right-side breathing room before the arrow.
- **Announcement Arrow**: Simple right arrow, around 22–24px visual size, with 16–18px horizontal padding.
- **Floating AI Command Bar**: Fixed at bottom center, approximately 770px wide and 72px high in the reference screenshot. Use white background, 1px #EAEAEA border, 4–6px radius, 24px left padding, and soft floating shadow. Position around 44px above the bottom edge on desktop.
- **Command Prompt Text**: Text reads "Ask TisiOps Agent to deploy...". "Ask TisiOps Agent" uses #FF4400 at 500 weight; "to deploy..." uses #777473 at 400 weight. Both are approximately 16px.
- **Upload / Cloud Icon**: Approximately 20–22px, #8C8C8C, placed near the right side of the command bar before the send control.
- **Send Button**: Approximately 52×52px, 4–6px radius. Disabled state uses #FFD9CA background with white arrow; active state uses #FF4400. Keep the arrow icon centered and minimal.
- **Buttons**: In general, buttons use compact radii, solid fills, no strong shadows, and 48–54px heights. Primary buttons use orange; neutral icon controls stay transparent or softly bordered.
- **Cards and Surfaces**: Use flat white surfaces with 1px neutral borders. Avoid layered glass effects, gradients, oversized shadows, or 16–24px radii.
- **Icons**: Thin, simple line icons. Typical visual size is 18–22px. Use #242424 for primary utility icons, #8C8C8C for secondary icons, and #FF4400 for selected/active state.
- **Interactions**: Use quick color transitions rather than dramatic motion. Recommended duration is 150–200ms with ease-out. Keep hover changes subtle and precise.

## Spacing
- **Base unit**: 4px
- **Scale**: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px, 120px, 140px
- **Reference viewport**: 2048 × 1260 px
- **Desktop page padding**: Approximately 136–140px left; use 140px as the design token
- **Header height**: Approximately 84px
- **Content max width**: Approximately 1768–1770px at the reference viewport
- **Desktop navigation gap**: Approximately 48–56px
- **Hero top padding**: Approximately 350px at the 2048px reference width/height
- **Hero bottom padding**: Approximately 100–120px
- **Hero title max width**: Approximately 1250px
- **Hero title to announcement gap**: Approximately 70–80px
- **Announcement height**: Approximately 68–70px
- **Announcement "New" segment horizontal padding**: Approximately 20px
- **Announcement message horizontal padding**: Approximately 16px left, 32–48px right
- **Floating command bar width**: Approximately 770px
- **Floating command bar height**: Approximately 72px
- **Floating command bar bottom offset**: Approximately 44px
- **Floating command bar internal padding**: Approximately 10–12px vertically, 24px left, 12px right
- **Dashboard button height**: Approximately 54px
- **Dashboard button horizontal padding**: Approximately 22–24px
- **Theme selector height**: Approximately 52px
- **Theme selector width**: Approximately 135px

### Responsive Container
```css
.container {
  width: 100%;
  max-width: 1770px;
  margin-inline: auto;
  padding-inline: clamp(24px, 6.8vw, 140px);
}
```

### Responsive Hero
```css
.hero {
  position: relative;
  min-height: calc(100svh - 84px);
  padding-inline: clamp(24px, 6.8vw, 140px);
  padding-top: clamp(180px, 27vh, 355px);
  padding-bottom: 100px;
}
```

### Floating Command Bar
```css
.agent-bar {
  position: fixed;
  left: 50%;
  bottom: 44px;
  transform: translateX(-50%);
  width: min(770px, calc(100vw - 48px));
  height: 72px;
  padding: 10px 12px 10px 24px;
}
```

### Mobile Guidance
- Reduce page padding to 20–24px
- Collapse central navigation into a menu below approximately 900–1024px
- Preserve 64–72px header height on mobile
- Reduce hero top whitespace while keeping the heading visually low in the first viewport
- Scale hero text down with `clamp()` rather than abrupt breakpoints
- Allow announcement content to wrap or convert to a stacked card below approximately 640px
- Keep the AI command bar fixed with 16–24px side margins and 16–24px bottom offset
- Maintain 48px minimum touch targets for interactive controls

## Border Radius
- **0px**: Full hero/background layers, binary texture layer
- **2px**: Extremely sharp inline surfaces if needed
- **4px**: Announcement card, small badges, compact controls
- **5–6px**: Dashboard button, send button, floating command bar
- **8px maximum for normal surfaces**: Use sparingly; the reference is intentionally sharper than typical SaaS UI
- **50%**: Circular icon selection inside theme control
- **9999px**: Theme-selector outer capsule only

The radius philosophy is restrained. Do not apply large rounded corners globally. Most visible surfaces should feel rectangular and engineered.

## Do's and Don'ts
- Do use #F9F7F6 as the dominant warm off-white canvas instead of pure white for the overall page
- Do use #FF4400 as the single dominant accent color for CTAs, selected states, badges, and AI-command emphasis
- Do keep the hero headline large, medium-weight, tightly tracked, and left aligned
- Do preserve the large empty vertical space above the hero headline — the whitespace is a major part of the composition
- Do keep desktop content aligned to an approximately 140px page gutter at the 2048px reference width
- Do use subtle borders and minimal shadows to separate white utility surfaces from the warm background
- Do vary the opacity of the orange binary pattern so it feels organic and computational rather than tiled
- Do keep navigation and utility icons small and understated
- Do use a fixed bottom-center AI command bar as the strongest floating element
- Do make primary hover states darker rather than brighter
- Do use 150–200ms ease-out transitions for responsive, technical-feeling interactions
- Don't use heavy gradients — the reference relies on flat color and texture
- Don't use glassmorphism, background blur cards, or translucent floating panels
- Don't use large 16–32px radii on cards and buttons
- Don't use very heavy 800–900 hero font weights; the display text should remain around 500–600
- Don't use pure black for the hero; use charcoal #2E2D2D
- Don't fill every empty area with content — whitespace is intentionally part of the design
- Don't make the binary pattern equally dark across the whole hero
- Don't use strong black drop shadows
- Don't turn the Dashboard button into a pill
- Don't let the hero headline wrap unpredictably on the reference desktop layout; preserve the intended two-line composition
- Don't introduce extra accent colors unless a new product state requires them
