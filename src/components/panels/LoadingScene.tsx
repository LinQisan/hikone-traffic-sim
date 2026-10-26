export function LoadingScene() { return (
    <svg className="scene" viewBox="0 0 240 120" role="img" aria-label="横断歩道をわたる小熊のイラスト / A little bear crossing the road">
      <g className="road">
        <rect x="0" y="86" width="240" height="34" fill="#7f86a8"/>
        <g className="stripes" fill="#f6f0dc"><rect x="70" y="90" width="12" height="26" rx="2"/><rect x="90" y="90" width="12" height="26" rx="2"/><rect x="110" y="90" width="12" height="26" rx="2"/><rect x="130" y="90" width="12" height="26" rx="2"/><rect x="150" y="90" width="12" height="26" rx="2"/></g>
      </g>
      <g className="car" transform="translate(196 74)">
        <rect x="0" y="6" width="38" height="16" rx="6" fill="#8fb6d8"/><rect x="7" y="0" width="22" height="11" rx="4" fill="#bcd7ee"/>
        <circle cx="9" cy="23" r="4.5" fill="#33405a"/><circle cx="30" cy="23" r="4.5" fill="#33405a"/>
        <circle className="lamp" cx="1.5" cy="13" r="2.2" fill="#ffe08a"/>
      </g>
      <g className="bear">
        <g className="legs"><rect className="leg l" x="-9" y="20" width="8" height="12" rx="4" fill="#d9a86c"/><rect className="leg r" x="1" y="20" width="8" height="12" rx="4" fill="#d9a86c"/></g>
        <ellipse cx="0" cy="12" rx="13" ry="14" fill="#e0b47c"/><ellipse cx="0" cy="15" rx="8" ry="8" fill="#ffe7c4"/>
        <g className="head">
          <circle cx="-11" cy="-17" r="6" fill="#e0b47c"/><circle cx="11" cy="-17" r="6" fill="#e0b47c"/>
          <circle cx="-11" cy="-17" r="3" fill="#eba091"/><circle cx="11" cy="-17" r="3" fill="#eba091"/>
          <circle cx="0" cy="-6" r="15" fill="#e0b47c"/>
          <ellipse cx="0" cy="-1" rx="7" ry="5" fill="#ffe7c4"/><ellipse cx="0" cy="-3" rx="2.6" ry="1.9" fill="#2a3441"/>
          <circle className="eye" cx="-5.5" cy="-8" r="1.8" fill="#2a3441"/><circle className="eye" cx="5.5" cy="-8" r="1.8" fill="#2a3441"/>
          <circle cx="-9" cy="-3" r="2.2" fill="#eba091" opacity=".7"/><circle cx="9" cy="-3" r="2.2" fill="#eba091" opacity=".7"/>
        </g>
        <path d="M-10 5 Q0 10 10 5 L10 8 Q0 13 -10 8Z" fill="#4ea596"/><rect x="4" y="7" width="4" height="9" rx="2" fill="#4ea596"/>
        <g className="arm"><rect x="10" y="2" width="6" height="13" rx="3" fill="#d9a86c" transform="rotate(-150 13 4)"/></g>
      </g>
    </svg>
); }
