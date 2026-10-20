// Tests are plain JS and import "../src/*.js"; run them against the compiled build in dist/.
export default {
  testEnvironment: "node",
  moduleNameMapper: {
    "^[.][.]/src/(.*)$": "<rootDir>/dist/$1",
  },
};
