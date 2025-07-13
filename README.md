[CONL](https://github.com/ConradIrwin/conl) is a post-minimal, human-centric configuration language.

It is designed as an alternative to JSON/YAML/TOML etc. to be better suited for human edited configuration files.

This repository contains the Typescript/Javascript implementation.

### Installation

```
npm install conl
```

### Usage

```typescript

import {parse} from 'conl';

parse("a = b")
// => {"a": "b"}
```

Unlike JSON, CONL has no special syntax for numbers or booleans. If you'd like to interpret some scalars as

```typescript
import {parse} from 'conl';

parse("timeout = 3s", (key, value) => {
  // Convert timeout values like "3s" to milliseconds
  if (key === "timeout" && typeof value == "string") {
    const match = value.match(/^(\d+)s$/);
    if (match) {
      return parseInt(match[1], 10) * 1000;
    }
  }
  return value;
});
// timeout = 3000
```
