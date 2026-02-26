import React from 'react';

export function Skeleton({
    variant = 'text',
    width,
    height,
    className = '',
    style = {}
}) {
    const styles = {
        width,
        height,
        ...style,
    };

    return (
        <div
            className={`skeleton skeleton--${variant} ${className}`}
            style={styles}
        />
    );
}
