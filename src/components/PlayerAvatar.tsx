import React from 'react';

interface AvatarGenerativeProps {
  username: string;
  size?: number;
  className?: string;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

const PlayerAvatar: React.FC<AvatarGenerativeProps & { src?: string | null }> = ({
  username,
  size = 48,
  className = '',
  src,
}) => {
  if (src) {
    return (
      <img
        src={src}
        alt={username}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Generate geometric pattern from username hash
  const hash = hashCode(username);
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const filled = (hash >> i) & 1;
    if (filled) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      cells.push(
        <rect
          key={i}
          x={col * 10 + 5}
          y={row * 10 + 5}
          width="10"
          height="10"
          fill={`hsl(${hue1}, 60%, 60%)`}
          opacity={0.8}
        />
      );
      // Mirror horizontally for symmetry
      if (col < 2) {
        cells.push(
          <rect
            key={`m${i}`}
            x={(4 - col) * 10 + 5}
            y={row * 10 + 5}
            width="10"
            height="10"
            fill={`hsl(${hue2}, 50%, 55%)`}
            opacity={0.8}
          />
        );
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      className={`rounded-full ${className}`}
      style={{ background: `hsl(${hue1}, 20%, 15%)` }}
    >
      {cells}
    </svg>
  );
};

export default PlayerAvatar;
