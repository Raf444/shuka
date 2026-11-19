import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container">
      <div className="state-box empty notfound">
        <div className="nf-code">404</div>
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for doesn't exist or was moved.</p>
        <div className="row-gap center-row">
          <Link to="/" className="btn">Go home</Link>
          <Link to="/search" className="btn btn-outline">Browse products</Link>
        </div>
      </div>
    </div>
  );
}
