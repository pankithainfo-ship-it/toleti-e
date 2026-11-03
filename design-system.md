# Toleti-e Design System

This document records the visual patterns currently used by Toleti-e and provides guidance for keeping future screens consistent. It describes the implementation in `src/index.css` and `src/App.css`; it is a design reference, not a claim that every value is already implemented as a shared CSS token.

## 1. Product and Visual Direction

Toleti-e is a business-document workspace for quotations, purchase orders, invoices, debit notes, credit notes, and delivery challans. The interface should feel clear, trustworthy, and practical for administrative work.

The existing visual language is based on:

- Deep green for the brand and primary actions
- White surfaces on a soft gray-green application canvas
- Dark green-gray text with muted secondary labels
- Light borders and restrained shadows
- Compact, readable controls and document-focused layouts

## 2. Color Palette

The values below are taken from the current CSS. The named CSS custom properties are defined within the login and dashboard page scopes in `src/App.css`.

| Role | Value | Current use |
|---|---|---|
| Primary green | `#176b59` | Main buttons, active navigation, links, and brand accents |
| Dark green | `#105446` | Hover state for primary actions |
| Main text | `#172a27` | Headings and body text |
| Muted text | `#71807c` | Descriptions, secondary labels, and supporting text |
| Border | `#e5ebe8` | Input, card, header, and layout separators |
| App canvas | `#f7f9f7` | Dashboard and small-screen login background |
| Surface | `#ffffff` | Cards, header, sidebar, and form fields |
| Active/soft green | `#eaf4ee` | Selected navigation and service icon backgrounds |
| Error text | `#a33a32` | Dashboard search errors |
| Login notice | `#8b5e25` | Login form status message |

### Color usage

- Reserve primary green for the most important action or selected state in a region.
- Use dark green for hover feedback, not as a second competing primary color.
- Keep large content surfaces white or near-white to support document readability.
- Use muted text for supporting information, not for important actions or required field labels.
- Keep error and status text distinct from normal supporting copy.

## 3. Typography

### Font family

The global stack is:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Inter is preferred when available; the remaining stack provides system fallbacks.

### Type hierarchy

Current screens use a compact sans-serif hierarchy. Representative existing sizes:

| Element | Approximate size | Typical weight |
|---|---:|---:|
| Login hero heading | `clamp(38px, 4vw, 56px)` | 500 |
| Page heading | `clamp(25px, 3vw, 34px)` | 600 |
| Login form heading | `30px` | 600 |
| Section heading | `16px` | 600 |
| Body and form content | `13px`–`15px` | 400 |
| Button and field labels | `12px`–`14px` | 600 |
| Eyebrow and metadata | `10px`–`12px` | 600–700 |

Use page headings to establish hierarchy, section headings for grouping, and small uppercase eyebrow labels sparingly. Supporting copy should retain comfortable line height; the dashboard description uses `1.6`, and the login description uses `1.7`.

## 4. Layout and Spacing

- The desktop login view uses a two-column composition: branded welcome panel and sign-in form.
- The dashboard uses a fixed-height top header, a sidebar, and a centered content area with a maximum width of `1120px`.
- Dashboard service cards use a three-column grid on wide screens, two columns at narrower desktop sizes, and one column on small screens.
- Cards and panels use generous internal padding, while forms and dashboard controls remain compact.
- Use CSS grid or flexbox for alignment, and retain `minmax(0, 1fr)` in flexible grid columns to prevent content overflow.
- The global box model is `border-box`. The page supports viewport widths down to `320px`.

Spacing in the existing UI is context-based rather than a formal numeric scale. Common gaps include `4px`–`10px` for dense control groups, `15px`–`20px` for card and section spacing, and larger `30px`–`56px` intervals between major regions. Match nearby components rather than introducing unrelated spacing values.

## 5. Surfaces, Borders, and Shape

- Use white surfaces against the soft dashboard canvas for cards and working areas.
- Use light, low-contrast borders to define inputs, cards, and separators.
- Existing controls commonly use `7px`–`8px` corner radii; cards and larger panels commonly use `9px`–`14px`.
- Keep shadows subtle and reserved for elevated or interactive surfaces, such as a search panel or hovered service card.
- Use dashed borders for empty states when the intent is to invite the first action.

## 6. Components and Interaction Patterns

### Primary button

Use the primary green fill with white, medium/semibold text. Existing primary buttons are approximately `40px`–`51px` high, with rounded corners. Provide a darker green hover state and a visibly disabled state where applicable.

### Secondary button

Use a white or transparent surface, a light border, and dark muted text. On hover, strengthen the border and use the primary green for emphasis.

### Text links and utility actions

Use primary green text for secondary actions such as password visibility or help. Keep these visibly interactive and provide hover and keyboard-focus feedback.

### Inputs

- Use a white background, light border, and rounded corners.
- Keep labels visible outside the input; placeholders are examples, not substitutes for labels.
- Focus should change the border and provide a clear outline or soft green focus ring.
- Keep error and validation messages near the associated form or action.

### Navigation

- Render desktop navigation as a vertical sidebar.
- Distinguish the active item with a soft green background, primary green text, and a stronger weight.
- On mobile, make navigation horizontally scrollable rather than squeezing all items into a narrow row.

### Service cards

Use a white surface, a light border, left-aligned text, and a small soft-green icon badge. Hover feedback may include a slight lift and subtle shadow. Make the whole card actionable when it represents navigation.

### Search panel and results

Present search in a floating white panel with a light border, modest shadow, a clearly labeled input, loading/error/empty states, and a scrollable result list when needed.

### Empty states

Use a centered layout with a simple icon badge, a concise heading, and a short explanation. The dashed outline should be low-contrast and should not compete with the create action.

### Document forms and print views

Document screens should prioritize scanability, clear group headings, consistent field labels, and readable line-item details. Keep browser print output focused on the document itself; exclude application navigation and unrelated controls from printed content.

## 7. Branding and Imagery

- Keep the Toleti wordmark and green brand mark consistent across the login and dashboard surfaces.
- The login welcome panel uses a deep-green gradient and a custom building illustration; keep decorative imagery subordinate to the sign-in task.
- Use the existing restrained green illustration palette rather than introducing unrelated accent colors.
- Decorative graphics should not be the only way important information is conveyed.

## 8. Responsive Behavior

The current CSS uses these breakpoints:

| Breakpoint | Existing behavior |
|---|---|
| `max-width: 1000px` | Dashboard sidebar narrows; service cards move to two columns |
| `max-width: 850px` | Login columns and panel padding become more compact |
| `max-width: 680px` | Login becomes a single-panel form; dashboard sidebar becomes horizontal navigation |
| `max-width: 440px` | Dashboard service cards use one column |
| `max-width: 380px` | Login horizontal padding and card padding reduce |

When adding responsive behavior, preserve access to all navigation and actions, prevent horizontal page overflow, and keep form controls usable at the supported `320px` minimum width.

## 9. Accessibility and Motion

- Use semantic headings, buttons, labels, and navigation landmarks.
- Associate each form control with a visible label.
- Keep keyboard focus clearly visible; existing controls use green-toned focus outlines.
- Do not rely on color alone to communicate selected, error, disabled, or status states.
- Ensure interactive targets have descriptive accessible names and remain usable with keyboard input.
- Respect `prefers-reduced-motion`; the existing stylesheet reduces transition duration for users requesting reduced motion.
- Maintain readable contrast for muted text, especially when used on tinted or colored surfaces.

## 10. CSS Implementation Guidance

Current global styles live in `src/index.css`; application and component styles live in `src/App.css`. The primary green, ink, muted-text, and border properties are currently declared as scoped custom properties within `.login-page` and `.dashboard-page`.

For new UI:

1. Reuse the existing page and component conventions in `src/App.css`.
2. Prefer the existing scoped color properties where they apply.
3. Keep selectors specific to the component or page to avoid unintended document-form changes.
4. Reuse existing button, card, input, and focus patterns instead of creating visual variants without a need.
5. If the visual system is later extracted into shared tokens, preserve the current rendered appearance and document the token source in one place.

## 11. Design System Summary

Toleti-e's current UI is a responsive, green-led administrative workspace. Its design system is built around clear document workflows, legible typography, neutral surfaces, subtle borders, accessible focus states, and compact responsive navigation. New features should extend these patterns rather than introducing a separate visual language.
