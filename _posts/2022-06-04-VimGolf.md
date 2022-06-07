---
layout: post
title: VimGolf prepend * to every non-blank line
---

## 5e4dfcccaa2db400090b66c3
Prepend an asterisk to every non-blank line in the input file.

### Start file
```text
This is a
very short

file, but it is 
still
full

of

surpises.
```

### End file
```text
*This is a
*very short

*file, but it is 
*still
*full

*of

*surpises.
```

Here are your keystrokes:
```zsh
<C-V>10jI*<Esc><Esc>2jx4jx2jx:wq!<CR>
```