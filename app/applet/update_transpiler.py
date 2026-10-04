import re

with open('src/utils/japaneseImeTranspiler.ts', 'r', encoding='utf-8') as f:
    c = f.read()

# Replace <F5:3010> -> [, <F5:3011> -> ], <F5:30FB> -> ,
c = c.replace('<F5:3010>', '[')
c = c.replace('<F5:3011>', ']')
c = c.replace('<F5:30FB>', ', ')

# Fix Mozc specific homophones:
# 1. 悪心: akusin (not osinn which becomes おしん)
c = c.replace("'悪心': 'osinn '", "'悪心': 'akusin '")
c = c.replace("'悪心なし': 'osinn nasi '", "'悪心なし': 'akusin nasi '")
c = c.replace("'悪心・嘔吐': 'osinn , outo '", "'悪心・嘔吐': 'akusin , outo '")
c = c.replace("'悪心・嘔吐なし': 'osinn , outonasi '", "'悪心・嘔吐なし': 'akusin , outonasi '")

# 2. 転倒し -> tentou si
c = c.replace("'室内で転倒し': 'situnaide tenntousi '", "'室内で転倒し': 'situnaide tentou si '")
c = c.replace("'転倒し': 'tenntousi '", "'転倒し': 'tentou si '")

# 3. 受傷後の悪心・嘔吐なし -> jyusyou no akusin , outonasi
c = c.replace("'受傷後の悪心・嘔吐なし': 'jyusyougono osinn , outonasi '", "'受傷後の悪心・嘔吐なし': 'jyusyou no akusin , outonasi '")

# 4. 耳出血 -> ji syukkatu
c = c.replace("'耳出血': 'jisyukkatu '", "'耳出血': 'ji syukkatu '")
c = c.replace("'耳出血・鼻出血なし': 'jisyukkatu , bisyukkatu nasi '", "'耳出血・鼻出血なし': 'ji syukkatu , bi syukkatu nasi '")

# 5. に基づき -> ni motozuki
c = c.replace("'に基づき': 'nimotuduki '", "'に基づき': 'ni motozuki '")

# 6. Check single char fallback for 【, 】, ・
c = c.replace("result += '<F5:3010> ';", "result += '[';")
c = c.replace("result += '<F5:3011> ';", "result += '] ';")
c = c.replace("result += '<F5:30FB> ';", "result += ', ';")

# And remove any remaining <F5: in single char loop
old_f5_block = '''      } else if (code >= 0x4E00 && code <= 0x9FFF) {
        // ★ 辞書未登録の漢字を絶対に空白消滅させず、Unicode F5直撃コードを送出！
        const hex = code.toString(16).toUpperCase().padStart(4, '0');
        result += `<F5:${hex}> `;
      }'''
new_f5_block = '''      } else if (code >= 0x4E00 && code <= 0x9FFF) {
        // Mozc / Linux 向けには未知漢字も安全に処理
        result += oneChar;
      }'''
if old_f5_block in c:
    c = c.replace(old_f5_block, new_f5_block)

with open('src/utils/japaneseImeTranspiler.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print('Updated japaneseImeTranspiler.ts for Mozc!')
