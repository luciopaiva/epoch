
# Project Epoch

A platform for creating timelines.

## TypeScript configuration

Configuring TypeScript to work was not a straightforward task. First I had to `sudo npm install typings -g`. Typings is
 a third-party library definition manager. Javascript libraries don't usually bring TypeScript definitions with them.
 Fortunately, there's a project called DefinitelyTyped which provides definitions for all those popular libraries out
 there.

So, after installing it, you'll want to use it to add definitions used by your project. For instance, to install
definitions for Express:

    typings install express --ambient --save

This will install definitions for Express and also save it to a file called `typings.json`. So far, so good. The problem
is that `typings` has a few issues. The first is that is refuses to download sub-dependencies. The definition for
`express` requires some other definitions:

    ><((°> typings install express --ambient --save                                                                                                                                                             03:02:29
    typings INFO reference Stripped reference "https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/7de6c3dd94feaeb21f20054b9f30d5dabc5efabd/serve-static/serve-static.d.ts" during installation from "express"
    typings INFO reference Stripped reference "https://raw.githubusercontent.com/DefinitelyTyped/DefinitelyTyped/7de6c3dd94feaeb21f20054b9f30d5dabc5efabd/express-serve-static-core/express-serve-static-core.d.ts" during installation from "express"
    express
    └── (No dependencies)

`typings` warns you about it having "stripped" some references. What it means is that it didn't download it for you
(have no idea why!), so you have to manually do it:

    typings install serve-static express-serve-static-core --ambient --save

That `--ambient` thing is really getting on my nerves. Anyway, by now you should've found out that there are still some
other dependencies to fetch, because it will tell you it stripped some other definitions. Well, after you manually
fetch all of them, you'll end up with the following `typings.json`:

    {
      "ambientDependencies": {
        "express": "registry:dt/express#4.0.0+20160317120654",
        "express-serve-static-core": "registry:dt/express-serve-static-core#0.0.0+20160317120654",
        "mime": "registry:dt/mime#0.0.0+20160316155526",
        "node": "registry:dt/node#4.0.0+20160319033040",
        "serve-static": "registry:dt/serve-static#0.0.0+20160317120654"
      }
    }

Phew. Well, it's not over yet. Try requiring Express in a script now:

    import express = require('express');

    let app = express();

And transpile it. TypeScript will complain about a lot of *TS2300: Duplicate "something"*. If you see inside the
`typings` folder, you'll notice there is a `browser` and a `main` folder. `browser` is meant to be used by client-side
applications and `main` is for server-side projects. So, what you need to do is exclude the one you don't want from the
`tsconfig.json` file, like this:

    "exclude": [
        "node_modules",
        "typings/browser",
        "typings/browser.d.ts"
    ]

And then we're finally done configuring TypeScript. Far from being straightforward, like I said.
