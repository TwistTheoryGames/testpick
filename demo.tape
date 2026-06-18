# Generate a demo GIF for testpick.
#
#   brew install vhs        # https://github.com/charmbracelet/vhs
#   vhs demo.tape           # produces testpick-demo.gif
#
# Run this INSIDE a Vitest/Jest project that has testpick installed (or rely on
# npx, as below). Set FILE to a real source file in your repo so `run` has a diff
# to react to.

Output testpick-demo.gif

Set Shell zsh
Set FontSize 18
Set Width 1100
Set Height 640
Set Theme "Dracula"
Set TypingSpeed 60ms
Set Padding 20

# --- 1. Build the map once ---------------------------------------------------
Type "npx testpick map"
Enter
Sleep 7s

# --- 2. Change one source file ----------------------------------------------
# Replace src/util.ts with any real file in your project.
Type "echo '// touched' >> src/util.ts"
Enter
Sleep 1s

# --- 3. Run only the affected tests -----------------------------------------
Type "npx testpick run"
Enter
Sleep 5s

# --- 4. Explain the selection -----------------------------------------------
Type "npx testpick explain"
Enter
Sleep 5s

# --- cleanup ----------------------------------------------------------------
Type "git checkout -- src/util.ts"
Enter
Sleep 1s
