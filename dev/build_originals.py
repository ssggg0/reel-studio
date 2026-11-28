"""릴 스튜디오 무가공 클린 원본 번들 빌더.

downloads/hipplug_batch3 · downloads/tiktok_cute_cat_10 에서 12편을 골라
reel-studio-repo/originals/ 로 복사하고, 세로 썸네일 JPG를 뽑고,
manifest.json · js/originals-data.js 를 다시 쓴다.
"""
import json, os, re, shutil, subprocess, sys

FF = '/workspace/bin/ffmpeg'
ROOT = '/workspace/reel-studio-repo'
OUT = os.path.join(ROOT, 'originals')
THUMBS = os.path.join(OUT, 'thumbs')

# (파일명, 원본경로, 제목, 카테고리, 추천 훅, 원작자, 비고)
PICKS = [
    ('meme01_summer_window.mp4', 'downloads/hipplug_batch3/popular_01.mp4',
     '창문 열어둔 여름밤의 최후', '해외밈',
     '여름밤에 창문 열어두면 벌어지는 일', 'TikTok @muneymancarl',
     '대사 거의 없는 비주얼 개그 · 자막 1~2줄이면 완성',
     'When you leave your window open during the summer'),
    ('meme02_drunk_drive.mp4', 'downloads/hipplug_batch3/popular_03.mp4',
     '"나 술 마시면 운전 더 잘해"', '해외밈',
     '이미 죽은 사람이 하던 말이었습니다', 'TikTok @pr0dxgyy',
     '원본 540p(576×1016) · 반전 구조라 마지막 한 줄이 핵심',
     'Dont drink and drive pr0dxgyy'),
    ('meme03_cat_talk.mp4', 'downloads/hipplug_batch3/popular_04.mp4',
     '이 고양이가 영어를 알아듣는 이유', '해외밈',
     '주인 말을 다 알아듣는 척하는 고양이', 'TikTok @jv.ari',
     '원음이 잔잔함 · 초월번역 자막이 재미를 만들어야 함',
     'cat understands English jv.ari'),
    ('meme04_jamaica_accent.mp4', 'downloads/hipplug_batch3/popular_05.mp4',
     '병가 전화하다 자메이카 액센트', '해외밈',
     '병가 전화하다가 액센트가 튀어나왔다', 'TikTok @chief.yummy',
     '비속어 없음 · 액센트 상황극',
     'not Jamaican accent comes out chief.yummy'),
    ('meme05_freeze_time.mp4', 'downloads/hipplug_batch3/new_02.mp4',
     '시간을 멈추는 친구, 근데 못 믿겠다', '해외밈',
     '시간을 멈출 수 있는 친구와 물 마시기', 'TikTok @thatmattstorms',
     '1080×1920 · 43초라 20~28초로 잘라 쓰기 좋음',
     'friend can freeze time but you cant trust them'),
    ('meme06_press_conf.mp4', 'downloads/hipplug_batch3/new_03.mp4',
     '영화 기자회견인데 "우리 누구세요?"', '해외밈',
     '기자회견에서 배우가 자기 정체를 잊었다', 'TikTok @thats.a.bad.idea',
     '1080×1920 · 28초 · 대사 위주 상황극',
     'press conference who are you thats a bad idea'),
    ('cat01_kungfu.mp4', 'downloads/tiktok_cute_cat_10/01_nuannuan2026_7699320687797734676.mp4',
     '파 들고 쿵푸하는 고양이', '동물',
     '파를 든 채로 발차기를 시작했다', 'TikTok @nuannuan2026',
     '8.8초 · 무자막 무워터마크 원본',
     '@nuannuan2026 kungfu cat leek'),
    ('cat02_tissue_cut.mp4', 'downloads/tiktok_cute_cat_10/02_iampidan_7699024310022819103.mp4',
     '휴지 한 장을 발로 자르는 새끼 고양이', '동물',
     '발로 휴지를 정확히 잘랐습니다', 'TikTok @iampidan',
     '9.8초 · 무자막 무워터마크 원본',
     '@iampidan kitten tissue kick'),
    ('cat03_tissue_tap.mp4', 'downloads/tiktok_cute_cat_10/03_lynn59716_7698336852662586676.mp4',
     '무릎 위 고양이가 티슈를 치는 이유', '동물',
     '이 동작을 계속 반복합니다', 'TikTok @lynn59716',
     '14.9초 · 무자막 무워터마크 원본',
     '@lynn59716 cat tissue paw'),
    ('cat04_net_hat.mp4', 'downloads/tiktok_cute_cat_10/04_nuannuan2026_7691343558963383572.mp4',
     '그물모자 쓴 고양이의 파 장난', '동물',
     '모자를 썼는데 표정이 더 이상해졌다', 'TikTok @nuannuan2026',
     '9.8초 · 무자막 무워터마크 원본',
     '@nuannuan2026 cat net hat leek'),
    ('cat05_bath.mp4', 'downloads/tiktok_cute_cat_10/06_cat7cc_7662585819126926600.mp4',
     '욕조에서 목욕하는 메인쿤', '동물',
     '이 표정으로 목욕을 합니다', 'TikTok @cat7cc',
     '7.8초 · 무자막 무워터마크 원본',
     '@cat7cc maine coon bath'),
    ('cat06_black_cat.mp4', 'downloads/tiktok_cute_cat_10/09_thekittyandrea_7149904691520998662.mp4',
     '카메라를 빤히 보는 검은 고양이', '동물',
     '5초 동안 한 번도 눈을 안 깜빡인다', 'TikTok @thekittyandrea',
     '5.4초 · 무자막 무워터마크 원본',
     '@thekittyandrea black cat bed'),
]

MAX_EACH = 15 * 1024 * 1024
LIMIT_TOTAL = 80 * 1024 * 1024


def probe(path):
    out = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    d = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', out)
    dur = (int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))) if d else 0
    v = re.search(r'Video: .*?, (\d{2,5})x(\d{2,5})', out)
    wh = (int(v.group(1)), int(v.group(2))) if v else (0, 0)
    return round(dur, 1), wh


def thumb(src, dst, dur):
    t = min(max(0.6, dur * 0.18), max(0.6, dur - 0.4))
    subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', src,
                    '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', dst], check=True)


def main():
    os.makedirs(THUMBS, exist_ok=True)
    items, total = [], 0
    for fname, rel, title, cat, hook, credit, note, search in PICKS:
        src = os.path.join('/workspace', rel)
        dst = os.path.join(OUT, fname)
        size = os.path.getsize(src)
        if size > MAX_EACH:
            print('TOO BIG', rel, size, file=sys.stderr)
            return 1
        shutil.copy2(src, dst)
        total += size
        dur, wh = probe(dst)
        tname = fname.rsplit('.', 1)[0] + '.jpg'
        thumb(dst, os.path.join(THUMBS, tname), dur)
        items.append({
            'id': fname.rsplit('.', 1)[0],
            'file': 'originals/' + fname,
            'thumb': 'originals/thumbs/' + tname,
            'title': title, 'cat': cat, 'hook': hook,
            'len': dur, 'w': wh[0], 'h': wh[1], 'bytes': size,
            'credit': credit, 'note': note, 'search': search,
        })
        print(f'{fname}  {size/1048576:5.1f}MB  {dur:5.1f}s  {wh[0]}x{wh[1]}')

    if total > LIMIT_TOTAL:
        print('TOTAL TOO BIG', total, file=sys.stderr)
        return 1
    manifest = {'updated': '2026-11-28', 'totalBytes': total, 'items': items}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, 'js', 'originals-data.js'), 'w', encoding='utf-8') as f:
        f.write('/* 무가공 클린 원본 (dev/build_originals.py 가 originals/manifest.json 에서 생성) */\n')
        f.write('(function(){ window.RS = window.RS || {}; RS.originals = ')
        json.dump(items, f, ensure_ascii=False, indent=0)
        f.write('; })();\n')
    print(f'\n{len(items)}편 · 총 {total/1048576:.1f}MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
