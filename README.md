# Emotion-Responsive Reader 📚🙂

This project is a **research prototype in Human–Computer Interaction** that investigates how a digital reading interface can adapt its behaviour based on the reader’s detected emotions, using:

- A webcam feed 🎥  
- An emotion engine that interprets facial expressions from the video 🧠  
- An adaptation layer that turns emotions into a simple “mode”  
- An LLM that provides clarifications and deeper explanations 🤖  

---

## High-level idea

1. The camera looks at the reader’s face while they read.
2. The **emotion engine** estimates an emotional state from both expression scores and face geometry.
3. The **adaptation layer** maps the emotional state to a reading mode.
4. An integrated LLM explains the current paragraph in simpler terms, or suggests deeper directions to explore.

---

## Project structure 🗂

### `App.tsx` – main application

This file contains the main component that:

- Renders the reading experience:
  - The article text.
  - Highlighted hotspots with small hints.
  - An optional sidebar with a HUD and explanations.
  - Full-screen overlays for clarifications.
- Connects to the camera and coordinates when emotion tracking is running or stopped.
- Listens to the current mode from the adaptation layer and keeps local state in sync.
- Reacts to different modes:
  - In a “confused” state, it makes clarification tools more prominent and can show a simplified explanation of the current paragraph.
  - In a “happy” state, it can surface “dive deeper” calls-to-action and follow-up reading suggestions through the LLM.
  - In a "focused" state, it keeps the UI minimal with zero distractions.
- Manages which paragraph is “active” and which paragraph a clarification or deep dive refers to.
- Triggers LLM calls when the user clicks things like “Clarify this paragraph” or “Dive deeper” and displays the result in overlays.

---

### `Emotion Engine` –🧠

This module is responsible for **turning webcam frames into a discrete emotion label** that the rest of the app can react to.

#### Models used

It uses `face-api.js` under the hood with three specific networks:

- **TinyFaceDetector**  
  Used to detect a single face in the frame.

- **FaceLandmark68TinyNet**  
  Produces 68 facial landmarks (eyes, brows, nose, mouth, jawline). These are used for simple geometric heuristics such as brow furrow and mouth corner position.

- **FaceExpressionNet**  
  Produces probabilities for the standard 7 expressions:
  - neutral, happy, sad, angry, fearful, disgusted, surprised

### My extensions on top of the pre-trained models for emotion deduction

1. **Base expression probabilities (7 classes)**  
   For each frame, the engine reads the 7 expression probabilities from `FaceExpressionNet`. These are stored in a small rolling window (e.g. the last ~15 frames). The probabilities in that window are averaged so that decisions are based on a short history, not a single frame.

2. **Geometric features from landmarks**

   Using the 68-point landmarks, the engine computes two additional scalar features:

   - **Brow furrow**  
     - Uses points:
       - Inner brows: **21** and **22**  
       - Face width reference: **0** (left jaw) and **16** (right jaw)
     - Steps:
       - Compute the distance between points 21 and 22 (inner brow spacing).
       - Normalize that by the overall face width (distance between 0 and 16).
       - Map this normalized spacing into a 0–1 range where:
         - 0 ≈ relaxed/neutral spacing  
         - 1 ≈ strongly furrowed (brows drawn closer together)
     - Result: a **browFurrow score** in `[0, 1]` representing how “knitted” the brows look.

   - **Mouth corner drop**  
     - Uses points:
       - Mouth corners: **48** (left corner) and **54** (right corner)  
       - Upper lip center: **51**  
       - Lower lip center: **57**
     - Steps:
       - Compute the vertical position of each mouth corner relative to the midpoint between 51 and 57.
       - Average left and right offsets to get how far the corners sit below the mouth center.
       - Normalize by mouth width (distance between 48 and 54) to make it roughly scale-invariant.
       - Clamp to ≥ 0 so only “corners lower than neutral” drive the feature.
     - Result: a **cornerDrop score** where larger values correspond to a more downturned mouth (useful for detecting frustration/sadness).

3. **Mapping 7 expressions + geometry → 3 emotion labels**

   The engine then combines:

   - averaged 7-class expression probabilities  
   - `browFurrow` (furrow)  
   - `cornerDrop` (mouth corner drop)

   into three higher-level labels that the app uses:

   - **focused**
   - **confused**
   - **happy**

   This is done by computing heuristic scores for each of these 3 labels. Roughly:

   - **Confused**  
     - Strongly influenced by:
       - brow furrow (brows drawn together), plus
       - fearful/surprised components
   - **Happy**  
     - Driven by the happy expression probability,
       reduced slightly when strong negative expressions are present.
   - **Focused**  
     - Largely driven by neutral expression,
       reduced when the furrow or “negative” expressions are high so that it doesn’t override “confused” or “frustrated” in tense moments.

   After computing these four scores, they are clamped to ≥ 0, normalized so they sum to 1, and the label with the highest score is selected.

4. **Smoothing, dwell time, and cooldown**

   To avoid flicker and over-reactivity:

   - The engine waits until there is enough data in the window (warm-up period) before it starts making decisions.
   - It uses a **dwell time** (around 1 second): a new label must remain the best candidate consistently for a minimum period before the system actually switches to it.
   - It uses a **cooldown** (around 4 seconds) after a change, so labels don’t bounce rapidly back and forth if the face briefly changes or the model is noisy.

   Only when a candidate label is stable enough and not blocked by cooldown does the engine notify the rest of the system by sending the updated label to the adaptation layer.

---

### `Adaptation Layer` – 🎛

This module:

- Keeps track of the **current UI mode** used by the app (focused / confused / happy).
- Lets other parts of the app subscribe to mode changes.
- Receives new emotion labels from the emotion engine and updates the mode.
- Allows manual overrides from the UI (e.g. “preview this mode”) without needing emotion input.

It acts as a small **shared state + event bus** for the reading mode.

---

### `LLM Wrapper` – 🤖

This module:

- Provides a helper for sending prompts to the LLM(Gemini).
- Is used when the user:
  - asks for a **clarification** of the current paragraph (simplified explanation with definitions and analogies), or
  - requests a **deep dive** (follow-up reading ideas, related topics, or ways to extend the concept).
- Wraps the raw API call so the rest of the app only deals with:
  - “Prompt in” → “Plain text explanation or suggestions out”
- May also apply simple behaviours such as:
  - reusing answers for identical prompts (caching),
  - spacing out calls to avoid hitting rate limits,
  - translating API errors into user-friendly messages.

---

### `App.css` & `index.css` – styles 🎨

These files hold the visual styling for the project (layout, fonts, colors, etc.).  
They are not involved in emotion detection, adaptation logic, or LLM behaviour.

---

## How everything fits together 🔗

1. The app loads in the browser.
2. The user starts the camera.
3. The **emotion engine**:
   - Detects the face.
   - Computes 7 expression probabilities and basic geometric features (brow furrow, mouth corner drop).
   - Smooths these over a window of recent frames.
   - Derives one of the four labels: focused, confused, happy, or frustrated.
4. The **adaptation layer** stores that label as the current mode and notifies subscribers.
5. `App.tsx`:
   - Updates its local mode state.
   - Tweaks what is shown on screen accordingly (e.g. emphasize clarifications for confusion).
6. When the user clicks:
   - **“Clarify this paragraph”** → the app sends the paragraph and intent to the LLM client → displays a simpler explanation.  
   - **“Dive deeper”** → the app asks the LLM for follow-up ideas → shows suggestions or links in an overlay.

---

## Getting started 🚀

Basic steps (adjust to your tooling):

```bash
# install dependencies
npm install

# run the dev server
npm run dev
