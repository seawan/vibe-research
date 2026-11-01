import random
random.seed(0)
n = 10000
hits = sum(random.random() ** 2 + random.random() ** 2 < 1 for _ in range(n))
print(4 * hits / n)
