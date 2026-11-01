---
title: "Estimating pi with Monte Carlo"
subtitle: "A tiny co-authored experiment"
date: 2026-10-20
authors: [bob, alice]
ai:
  - name: ChatGPT
    model: gpt-5
    role: suggested the estimator and wrote the first draft
contribution: "Bob posed the question and ran the script; Alice reviewed the numbers; ChatGPT drafted the code and text."
license: CC-BY-4.0
code_license: MIT
tags: ["monte carlo", "sampling"]
author_verification:
  verified: true
  by: bob
  date: 2026-10-20
  checked: "Ran sim.py myself with the fixed seed and confirmed it prints the estimate quoted in Results."
summary: "Throw random points at a square and count how many land in the circle."
---

## The question

Can random points in a unit square estimate pi?

## What we did

We sampled points with a fixed seed in `sim.py`.

## Results

The estimate is close to 3.14.
