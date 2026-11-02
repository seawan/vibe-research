# How to write a Vibe Research post with Claude

This guide is the short version. You tell Claude what you want, check its work, and sign off. Claude writes the code, runs the experiment, makes the pictures and writes the text. The full rules are in [CONTRIBUTING.md](CONTRIBUTING.md), but you rarely need them, because Claude follows them for you.

## Before you start (one time only)

1. **Accounts.** You need a [GitHub](https://github.com) account and [Claude Code](https://claude.com/claude-code) (the desktop app or the terminal). For the "Delta-reproducible" badge, you also need a Delta account with `delta-cli` installed and logged in.
2. **Tools.** Install [Node.js](https://nodejs.org) version 22 or newer, and the GitHub command line tool `gh`. Log in once:

   ```bash
   gh auth login
   ```

3. **Your copy of the site.** Make your own copy (a fork) and download it:

   ```bash
   gh repo fork seawan/vibe-research --clone
   ```

   ```bash
   cd vibe-research && npm ci
   ```

   If you own the site, skip the fork and clone `seawan/vibe-research` directly.

4. **Let Claude use the post-writing skill from any folder.** Inside the `vibe-research` folder, run this once:

   ```bash
   mkdir -p ~/.claude/skills && ln -s "$PWD/skills/publish-vibe-research" ~/.claude/skills/publish-vibe-research
   ```

   Now `/publish-vibe-research` works wherever you open Claude, even in a folder with your own research. Claude finds your copy of the site and adds the post there. Because it is a link, the skill stays up to date whenever you update your copy (`git pull`).

5. **Keep delta-cli up to date** from time to time:

   ```bash
   npx @delta-infra/cli@latest install
   ```

## Writing a post, step by step

### 1. Open Claude

Open Claude Code in your `vibe-research` folder. If you installed the skill in step 4 above, you can also open it in any other folder, for example the one with your own results.

### 2. Tell Claude your idea

Say what you want in plain words. Say who the readers are, what the experiment should be, and what pictures you want. For example:

> Write a Vibe Research post for 12-year-olds: can a computer learn to tell cats from dogs? Run the experiment on Delta with a GPU. Explain every setting with an everyday example, and use lots of pictures and animations.

If you already have results (a notebook, a script, some figures), say so, and type **`/publish-vibe-research`** instead. Claude then turns your results into a post.

### 3. Let Claude build it

Claude will:

- write the experiment code;
- **ask you before it uses Delta**, because a Delta run uses your own quota. Say yes, and it runs the experiment in a cloud sandbox and brings the results back;
- make the pictures and animations from the real results;
- write the post, so that every number in it comes from the run.

### 4. Look at it

Ask Claude to **"show me the preview"**, or run this yourself and open http://localhost:4321:

```bash
npm run serve
```

### 5. Ask for changes

Read it the way your reader would. Then just say what to change, for example:

- "Make it simpler. A 12-year-old would not know what a *parameter* is."
- "Add an animation that shows the computer's guess changing as it learns."
- "This picture is confusing. Label the axes in words."
- "Ask ChatGPT (Codex) to rewrite it for kids, then check the numbers still match."

Repeat steps 4 and 5 until you are happy.

### 6. Sign it (only you can do this)

Before publishing, Claude asks you two things. **Answer in your own words. Claude will not write these for you.**

- **What you did and what the AI did.** For example: "I chose the topic and asked for lots of pictures. Claude wrote the code, ran it on Delta and wrote the text."
- **What you checked.** For example: "I read the whole post, looked at every picture, and checked that the main numbers match the results file."

### 7. Publish

Say **"publish it"**. Claude opens a pull request, which is a request to add your post to the site. Automatic checks run in a few minutes. Then the site owner merges it, and the post goes live at https://seawan.github.io/vibe-research/ a few minutes later.

To change a post later, ask Claude to edit it and "publish it" again.

## Good to know

- **Each post is one folder:** `posts/<your-github-name>/<post-name>/`. You can only change your own folders.
- **Pictures:** PNG, JPG, GIF (for animations) or WebP. Each file must be under 5 MB, and a whole post under 25 MB. HTML files are not allowed.
- **Numbers must be real.** Every figure and headline number has to come from the actual run. The site rejects figures that the experiment did not produce, unless the caption says it is a hand-made diagram.
- **References are checked.** If the post cites papers, each one is checked against arXiv, Crossref or Semantic Scholar before it can be published.
- **Name your AI helpers.** The post lists every AI that helped, such as Claude, or ChatGPT if it did a rewrite.

## If something goes wrong

- **A check fails on the pull request.** Tell Claude "the PR checks failed, please fix them". It can read the error and fix it.
- **The Delta run stopped or timed out.** Tell Claude, and it will check the sandbox and run it again. Claude always shuts sandboxes down afterwards so they do not keep using your quota.
- **Delta says "permission" or "auth".** Log in to `delta-cli` again, or ask Delta support.
