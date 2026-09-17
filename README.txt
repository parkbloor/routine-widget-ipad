RoutineWidget iPad PWA v1.1
============================

이 버전은 iPad의 파일 앱에서 기존 routine_schedule.html을 직접 불러올 수 있습니다.
Swift Playgrounds나 Mac은 필요 없습니다.

루틴 변경 시 사용법
-------------------
1. Windows에서 평소처럼 routine_schedule.html의 루틴을 수정합니다.
2. 수정된 HTML을 iCloud Drive 또는 iPad의 파일 앱으로 옮깁니다.
3. iPad의 반복 루틴 PWA를 엽니다.
4. 상단 'HTML / JSON' 버튼을 누릅니다.
5. 수정된 routine_schedule.html을 선택합니다.
6. 즉시 새 루틴으로 교체되고 iPad 브라우저에 저장됩니다.
7. 이후 앱을 다시 실행해도 마지막으로 불러온 루틴이 유지됩니다.

중요
----
- PWA는 보안상 외부 파일을 Windows 앱처럼 계속 감시할 수 없습니다.
- HTML 내용이 바뀌면 사용자가 한 번 다시 선택해 주어야 합니다.
- 같은 파일명이어도 새 파일을 선택하면 새 내용으로 덮어씁니다.
- iPad의 '나의 iPad' 또는 iCloud Drive에 둔 파일을 사용하는 것을 권장합니다.

지원하는 HTML 구조
------------------
Windows RoutineWidget과 동일한 구조를 읽습니다.

<section class="day-panel" id="day-4">
  <article class="routine" data-start="600" data-end="705">
    <h3>책 모작 · 안보고 그리기</h3>
    <label class="task"><span>작법서 예제 모작</span></label>
    <label class="task"><span>기억으로 다시 그리기</span></label>
  </article>
</section>

요일 번호
---------
0 = 일요일
1 = 월요일
2 = 화요일
3 = 수요일
4 = 목요일
5 = 금요일
6 = 토요일

기존 기능
---------
- 현재 시간에 따라 완료 / 진행중 / 대기 자동 변경
- 현재 루틴 파란 카드 강조
- 세로 시간축 현재 시각 포인터
- 긴 설명 자동 줄바꿈
- 월간 달력
- 서울 현재 날씨
- JSON 가져오기 호환 유지
- 가져온 일정 localStorage 저장
- PWA 오프라인 앱 셸

GitHub Pages 업데이트
--------------------
기존 GitHub 저장소에서 index.html, app.js, sw.js, README.txt를 이 버전 파일로 교체합니다.
styles.css, manifest.webmanifest, sample-routine.json, icons 폴더는 그대로 사용해도 됩니다.
GitHub Pages 배포가 끝난 뒤 iPad PWA를 완전히 종료했다가 다시 열면 새 버전이 적용됩니다.
