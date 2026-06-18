# Generate the demo GIF:  brew install vhs && vhs assets/demo.tape
# Produces assets/testpick-demo.gif
#
# This records against a real Vitest project. By default it points at the repo's
# example fixture (~/projects/difftest-real); change PROJECT below to any
# Vitest/Jest project of yours. testpick is fetched via npx.

Output assets/testpick-demo.gif

Set Shell zsh
Set Theme "Dracula"
Set FontSize 20
Set Width 1200
Set Height 600
Set Padding 24
Set TypingSpeed 55ms

# --- setup (hidden): pick a project, clean state, build the map once ---
Hide
Type "cd ~/projects/difftest-real && git checkout . 2>/dev/null; rm -rf .testpick" Enter
Sleep 1s
Type "clear && npx -y testpick map" Enter
Sleep 15s
Type "clear" Enter
Type "echo '// tweak a dynamically-loaded module' >> src/features/feat.ts" Enter
Show

# --- the story (recorded) ---
Type "# I changed one file. Which tests can it actually break?" Enter
Sleep 1500ms
Type "npx testpick run" Enter
Sleep 6s
Type "npx testpick explain" Enter
Sleep 7s

# --- cleanup (hidden) ---
Hide
Type "git checkout src/features/feat.ts 2>/dev/null" Enter
Show
