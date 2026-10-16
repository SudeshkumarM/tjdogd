const { execFileSync } = require("node:child_process");

const objectLines = execFileSync("git", ["rev-list", "--objects", "origin/main..HEAD"], {
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/);
const objects = objectLines.map((line) => line.split(" ")[0]);
const details = execFileSync(
  "git",
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  { input: `${objects.join("\n")}\n`, encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/);
const blobs = details
  .map((line, index) => {
    const [oid, type, size] = line.split(" ");
    return {
      oid,
      type,
      size: Number(size),
      path: objectLines[index].slice(oid.length).trim(),
    };
  })
  .filter((item) => item.type === "blob")
  .sort((left, right) => right.size - left.size);

console.log(
  "Total unique blob size:",
  (blobs.reduce((total, blob) => total + blob.size, 0) / 1048576).toFixed(1),
  "MiB",
);
for (const blob of blobs.filter((item) => item.size >= 1048576).slice(0, 50)) {
  console.log(`${(blob.size / 1048576).toFixed(2)} MiB ${blob.path}`);
}
