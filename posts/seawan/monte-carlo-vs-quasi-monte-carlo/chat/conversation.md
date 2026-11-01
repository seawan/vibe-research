# How this post was made

These are the key moments from the conversation between the author and Claude (claude-opus-5-5) in Claude Code. The author's messages have light grammar corrections; Claude's replies are shortened.

**Author:** Write the first blog entry for the Monte Carlo case, but write it so a 12-year-old can read it, with good illustrations. Use plain English.

**Claude:** Rewrote the π post for young readers: short sentences, everyday words ("neat darts" instead of "low-discrepancy points"), three hand-drawn diagrams and two new pictures made by the code. The harder maths moved into small "For grown-ups" boxes.

**Author:** The experiment was done by you, right? Did you use delta-cli?

**Claude:** Yes, I ran it, but only on the laptop. delta-cli had not been used, so the post could not get the Delta-reproducible badge yet.

**Author:** Okay. Let's make an example entry that uses a Delta run. Any ideas?

**Claude:** Suggested four: a billion darts for π on a GPU, teaching a computer to read handwriting, a tiny storyteller that learns to write fairy tales, and the birthday surprise.

**Author:** Cool. Try to do all four, and release them one by one as each is finished.

**Claude:** Wrote the code for each, ran them in Delta cloud sandboxes (always destroying the sandbox afterwards), and wrote each post from the recorded run. Along the way Delta refused some GPU requests, and one long run lost its live log, which led to fixes in the site's rerun tool.

**Author:** It is an AI vibe paper. This is for children to study AI.
