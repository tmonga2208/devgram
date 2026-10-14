import { test } from "node:test"
import assert from "node:assert/strict"
import { isPostKind, shuffled, withoutDevBits } from "../../lib/post-kinds.ts"

test("knows the two kinds of post", () => {
  assert.equal(isPostKind("post"), true)
  assert.equal(isPostKind("devbit"), true)
  for (const value of ["reel", "", undefined, null, 1]) assert.equal(isPostKind(value), false)
})

test("leaves DevBits out of a filter and keeps its other conditions", () => {
  assert.deepEqual(withoutDevBits(), { kind: { $ne: "devbit" } })
  assert.deepEqual(withoutDevBits({ language: "go" }), { language: "go", kind: { $ne: "devbit" } })
})

test("shuffles into a new array with the same items", () => {
  const items = [1, 2, 3, 4, 5]
  const result = shuffled(items)
  assert.notEqual(result, items)
  assert.deepEqual([...result].sort(), [1, 2, 3, 4, 5])
  assert.deepEqual(items, [1, 2, 3, 4, 5])
})

test("orders by the random numbers it is given", () => {
  assert.deepEqual(shuffled([1, 2, 3, 4], () => 0), [2, 3, 4, 1])
  assert.deepEqual(shuffled([1, 2, 3, 4], () => 0.999), [1, 2, 3, 4])
})
