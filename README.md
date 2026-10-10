# Ducks in a row

A to-do list where every task is a pixel-art duck. Add a task and an egg hatches into a duck that wanders the meadow. Finish it and the duck pops some hearts and waddles into the pond.

<!-- Add a screenshot or GIF here: ![Ducks in a row](docs/screenshot.png) -->

## Why I made it

I make lists, but why do they have to be so sterile? "Get groceries." I've come to realise that as an adult, you get to choose what you do and how you do it. I want to make simple things more fun. You hear the phrase "getting my ducks in a row". Imagine if we literally did that.

### Two decisions I'm proud of

1. **The duck lifecycle.** Making a to-do item used to be such a bore, so I decided to mimic the lifecycle of a duck to get things done: an egg hatches when you add a task, the duck wanders while it waits, and it swims off when you're done.
2. **Seeing the whole list.** I made sure you can still see the full list, even with lots of small tasks walking around everywhere. This was important for the main goal: seeing all your tasks and getting them done in a day.

## Features

- **Hatch a duck.** Click the egg (or press `N`), type a task, add notes if you want, and pick a due date: today, tomorrow or a specific day. After 8pm, new tasks default to tomorrow.
- **Talk to a duck.** Hover over a duck to see its task. Click it and a speech bubble opens where you can tick it off or edit it. Delete lives inside the edit form so it's hard to hit by accident.
- **See everything at once.** Click the title card to drop down your full to-do list, grouped into Overdue, Today, Tomorrow and Later. Click a task to jump to its duck.
- **Finish a task.** Tick it off and the duck pops hearts and waddles into the pond. You get 5 seconds to undo, or dismiss the message to confirm.
- **The pond.** Ducks you finish today swim in the pond. Click one to see when you finished it, untick it to send it back onto the grass, or send it to the farmhouse early.
- **The farmhouse.** Your history of finished tasks, grouped by day.
- **Duck moods.** Ducks that are overdue sulk. The most overdue duck gets mad and chases your cursor (on a phone, it marches to the front of the screen and pecks). Only one duck is mad at a time, so you always know what to do next.
- **A full meadow.** There's room for 15 ducks on desktop and 8 on a phone. When it's full, finish something before you hatch a new one.
- **Add it to your home screen.** It can be installed like an app, with its own duck icon.

## Running it locally

It's plain HTML, CSS and JavaScript, with no build step or dependencies. Any static file server works:

```bash
python3 -m http.server 8417
```

Then open http://localhost:8417.

On localhost (or with `?dev` at the end of the URL), a **Prototype tools** panel appears for testing: add sample ducks, skip ahead a day to watch ducks get cross, or clear everything.

## Your data

Your ducks are saved in your browser (`localStorage`, under the key `ducks-in-a-row-v1`). Nothing is sent to a server and there's no account. That also means your ducks live on one device, and clearing your browser's site data deletes them. Adding the app to your home screen helps keep them safe.

## Accessibility

- Every duck and control can be reached with the keyboard. `N` adds a duck and `Esc` closes whatever is open.
- Dialogs, the to-do dropdown and the undo message have screen-reader labels.
- Animations are reduced when your device asks for reduced motion.

## Project structure

```
index.html              Page markup: meadow, speech bubble, forms, farmhouse
styles.css              Pixel-art UI, layout and animation
app.js                  Duck behaviour, storage and interactions
manifest.webmanifest    Lets the app be added to a home screen
assets/world.webp       Meadow background
assets/sprites/         Duck, egg and farmhouse sprites
assets/icons/           Favicon and app icons
```

## Credits

The duck sprites and meadow background are AI-generated images, inspired by Super Mario games.

## Licence

The code is released under the [MIT Licence](LICENSE).
